// The popup's rules, in your order, with no switches: each says its state in words, what it did on
// the tab's page ("2 mocked") or else On, Off or Paused, after T3 Code's "✓ Done" and "◌ Working".
// Under the pointer, or with the keyboard's focus on it, a button that says what a click does
// (Turn off, Turn on) takes the words' place. A rule's name opens it in the editor. Split, the
// rules that answered on the page come first, under "Answering here", and the rest fold into one
// row that opens.
import { useState } from 'react';
import { editRule, openRuleInEditor, ruleTitle } from '../../../shared/api/index.ts';
import type { Rule, RuleCount } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { didWords, matchLine } from '../lib/rule-words.ts';

export function RuleList({
  rules,
  counts,
  split,
  enabled,
  windowId,
  title,
}: {
  rules: Rule[];
  // What each rule did on the page, while it's known (recording, and Ghostfetch on there).
  counts: Record<string, RuleCount> | undefined;
  split: boolean;
  enabled: boolean;
  windowId: number;
  // The list's name when it isn't split.
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const answers = (rule: Rule) => rule.enabled && didWords(counts?.[rule.id]) !== '';
  const here = split ? rules.filter(answers) : rules;
  const rest = split ? rules.filter((rule) => !answers(rule)) : [];
  const on = rest.filter((rule) => rule.enabled).length;
  const row = (rule: Rule) => (
    <RuleRow
      key={rule.id}
      rule={rule}
      count={counts?.[rule.id]}
      enabled={enabled}
      windowId={windowId}
    />
  );
  return (
    // While Ghostfetch is paused, what it would do is dimmed.
    <div
      className={cn(
        'max-h-[368px] overflow-y-auto rounded-lg bg-card p-1 scroll-thin',
        !enabled && 'opacity-55',
      )}
    >
      <h2 className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-label font-medium text-t40">
        {split ? 'Answering here' : title}
        <span className="font-normal tabular-nums">{here.length}</span>
      </h2>
      {split && !here.length && (
        <p className="px-3 pb-2 text-meta text-t40">
          No rule has answered on this page yet.
        </p>
      )}
      {here.map(row)}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            data-testid="not-answering"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="mt-1 flex h-9 w-full items-center gap-1.5 border-t border-border px-3 text-label hover:bg-hover"
          >
            <span className="text-t65">Not answering here</span>
            <span className="ml-auto text-t40 tabular-nums">{`${on} on · ${rest.length - on} off`}</span>
            <Icon name={open ? 'down' : 'forward'} size={13} className="text-t40" />
          </button>
          {open && rest.map(row)}
        </>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  count,
  enabled,
  windowId,
}: {
  rule: Rule;
  count: RuleCount | undefined;
  enabled: boolean;
  windowId: number;
}) {
  const title = ruleTitle(rule);
  const did = didWords(count);
  const live = rule.enabled && enabled;
  const words = !rule.enabled ? 'Off' : !enabled ? 'Paused' : did || 'On';
  const action = rule.enabled ? 'Turn off' : 'Turn on';
  return (
    <div
      data-testid="popup-rule"
      className="group relative rounded-md px-3 py-[7px] hover:bg-hover"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Edit this rule"
          onClick={() => openRuleInEditor(rule.id, windowId)}
          className={cn(
            'min-w-0 truncate text-left text-title hover:underline hover:decoration-t40 hover:underline-offset-3',
            rule.enabled ? 'text-foreground' : 'text-t40',
          )}
        >
          {title}
        </button>
        <span
          data-testid="rule-state"
          className="ml-auto flex flex-none items-center gap-1.5 text-label transition-opacity group-hover:opacity-0 group-has-[[data-toggle]:focus-visible]:opacity-0"
        >
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              live && did
                ? 'animate-signal-pulse bg-signal'
                : rule.enabled
                  ? 'bg-t40'
                  : 'border border-t40',
            )}
          />
          <span
            className={
              live && did ? 'text-signal' : rule.enabled ? 'text-t65' : 'text-t40'
            }
          >
            {words}
          </span>
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta">
        <span className="truncate font-mono text-t50">{matchLine(rule)}</span>
        {/* The words make way for the button, so what the rule did moves here. */}
        {live && did && (
          <span className="hidden flex-none text-signal group-hover:inline">· {did}</span>
        )}
      </div>
      <button
        type="button"
        data-toggle
        data-testid="rule-toggle"
        aria-label={`${action} “${title}”`}
        onClick={() =>
          editRule(
            rule.id,
            (current) => {
              current.enabled = !current.enabled;
            },
            // The popup can close at any moment, so it saves at once.
            { immediate: true },
          )
        }
        className="pointer-events-none absolute top-[6px] right-3 flex h-6 items-center rounded-[6px] border border-input px-2 text-label font-medium text-t80 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:text-strong focus-visible:pointer-events-auto focus-visible:opacity-100"
      >
        {action}
      </button>
    </div>
  );
}
