// The popup's rules, in your order, each with its switch, the green dot: pulsing while the rule is
// on, still while Ghostfetch is paused, grey while it's off, as in the editor's list. Then its
// name, which opens it in the editor, with what it did on the tab's page at the right ("2
// mocked"), and what it matches under it. Split, the rules that answered on the page come first,
// under "Answering here", and the rest fold into one row that opens.
import { useState } from 'react';
import { countWords, openRuleInEditor, ruleTitle } from '../../../shared/api/index.ts';
import type { Rule, RuleCount } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { RuleSwitch } from '../../../shared/ui/rule-switch.tsx';
import { matchLine } from '../lib/rule-words.ts';

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
  const answers = (rule: Rule) => rule.enabled && countWords(counts?.[rule.id]) !== '';
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
  const did = rule.enabled ? countWords(count) : '';
  return (
    // As in the editor's list: the dot lines up with the label over the rules, and with the name's
    // line. It saves at once, as the popup can close at any moment.
    <div
      data-testid="popup-rule"
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-1 rounded-md px-3 py-[7px] hover:bg-hover"
    >
      <RuleSwitch rule={rule} immediate className="-my-0.5 -ml-[9px] self-start" />
      <div className="min-w-0">
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
            {ruleTitle(rule)}
          </button>
          {did && (
            <span
              data-testid="rule-did"
              className={cn(
                'ml-auto flex-none text-label',
                enabled ? 'text-signal' : 'text-t50',
              )}
            >
              {did}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-meta text-t50">
          {matchLine(rule)}
        </div>
      </div>
    </div>
  );
}
