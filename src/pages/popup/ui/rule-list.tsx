// The popup's rules, in your order, each with its switch, the green dot: pulsing while the rule is
// answering, still while it's on but its group or Ghostfetch is off, grey while it's off, as in
// the editor's list. Then its name, which opens it in the editor, with what it did on the tab's
// page at the right ("2 mocked"), and what it matches under it.
//
// Whole (All rules), it's the order as the editor's list has it: each group a row with its own dot,
// its name, which folds it or unfolds it as in the editor, and how many of its rules are on, its
// rules set in under it. Split (This page), the rules that answered on the page come first, under
// "Answering here", each with its group's name, and the rest fold into one row that opens. A rule
// is where what it did on the page puts it, not where its switch does: turned off, it stays in its
// place under "Answering here", so the same spot turns it on again, until the page loads anew.
import { useState } from 'react';
import {
  countWords,
  groupOf,
  openRuleInEditor,
  ruleTitle,
} from '../../../shared/api/index.ts';
import type { Entry, Group, Rule, RuleCount } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { foldStore, isFolded, setFolded } from '../../../shared/ui/group-folds.ts';
import { GroupSwitch } from '../../../shared/ui/group-switch.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { RuleSwitch } from '../../../shared/ui/rule-switch.tsx';
import { matchLine } from '../lib/rule-words.ts';

export function RuleList({
  rules,
  entries,
  counts,
  split,
  enabled,
  windowId,
  title,
}: {
  rules: Rule[];
  // The order's top level, for the list whole.
  entries: Entry[];
  // What each rule did on the page, while it's known (recording, and Ghostfetch on there).
  counts: Record<string, RuleCount> | undefined;
  split: boolean;
  enabled: boolean;
  windowId: number;
  // The list's name when it isn't split.
  title: string;
}) {
  useStore(foldStore);
  const [open, setOpen] = useState(false);
  // Whether it's on now or not: a row that left as its dot was clicked would put the next rule
  // under the pointer.
  const answers = (rule: Rule) => countWords(counts?.[rule.id]) !== '';
  const here = split ? rules.filter(answers) : rules;
  const rest = split ? rules.filter((rule) => !answers(rule)) : [];
  const on = rest.filter((rule) => rule.enabled).length;
  const row = (rule: Rule, inGroup = false) => (
    <RuleRow
      key={rule.id}
      rule={rule}
      group={groupOf(rule)}
      inGroup={inGroup}
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
      {split
        ? here.map((rule) => row(rule))
        : entries.map((entry) => {
            if (entry.kind === 'rule') return row(entry.rule);
            const folded = isFolded(entry.group.id);
            return (
              <div key={entry.group.id} data-testid="popup-group-block">
                <GroupRow group={entry.group} rules={entry.rules} folded={folded} />
                {!folded && entry.rules.map((rule) => row(rule, true))}
              </div>
            );
          })}
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
          {open && rest.map((rule) => row(rule))}
        </>
      )}
    </div>
  );
}

// A group's row: its dot (where a rule's is), its name, which folds it or unfolds it, and how many
// of its rules are on. Saved at once, as the popup can close at any moment.
function GroupRow({
  group,
  rules,
  folded,
}: {
  group: Group;
  rules: Rule[];
  folded: boolean;
}) {
  const on = rules.filter((rule) => rule.enabled).length;
  return (
    <div
      data-testid="popup-group"
      data-group={group.name}
      className="flex items-center gap-1 rounded-md px-3 py-[7px] hover:bg-hover"
    >
      <GroupSwitch group={group} className="-my-0.5 -ml-[9px]" />
      <button
        type="button"
        data-testid="popup-group-name"
        aria-expanded={!folded}
        title={folded ? `Unfold ${group.name}` : `Fold ${group.name}`}
        onClick={() => setFolded(group.id, !folded)}
        className={cn(
          'flex min-w-0 items-center gap-1 text-left text-title font-semibold',
          group.enabled ? 'text-foreground' : 'text-t40',
        )}
      >
        <span className="truncate">{group.name}</span>
        <Icon
          name={folded ? 'forward' : 'down'}
          size={13}
          className="flex-none text-t40"
        />
      </button>
      <span className="ml-auto flex-none pl-2 text-label text-t40 tabular-nums">
        {rules.length ? `${on} of ${rules.length} on` : 'No rules'}
      </span>
    </div>
  );
}

function RuleRow({
  rule,
  group,
  inGroup,
  count,
  enabled,
  windowId,
}: {
  rule: Rule;
  // Its group, if it's in one.
  group: Group | undefined;
  // Under its group's row, set in; elsewhere, the group's name goes with what it matches.
  inGroup: boolean;
  count: RuleCount | undefined;
  enabled: boolean;
  windowId: number;
}) {
  const groupOff = group?.enabled === false ? group.name : '';
  const answering = rule.enabled && enabled && !groupOff;
  // What it did on the page: green while it's still answering there, grey once it, its group or
  // Ghostfetch is off.
  const did = countWords(count);
  return (
    // As in the editor's list: the dot lines up with the label over the rules, and with the name's
    // line. It saves at once, as the popup can close at any moment.
    <div
      data-testid="popup-rule"
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-1 rounded-md px-3 py-[7px] hover:bg-hover',
        inGroup && 'pl-[26px]',
      )}
    >
      <RuleSwitch
        rule={rule}
        groupOff={groupOff}
        immediate
        className="-my-0.5 -ml-[9px] self-start"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Edit this rule"
            onClick={() => openRuleInEditor(rule.id, windowId)}
            className={cn(
              'min-w-0 truncate text-left text-title hover:underline hover:decoration-t40 hover:underline-offset-3',
              rule.enabled && !groupOff ? 'text-foreground' : 'text-t40',
            )}
          >
            {ruleTitle(rule)}
          </button>
          {did && (
            <span
              data-testid="rule-did"
              className={cn(
                'ml-auto flex-none text-label',
                answering ? 'text-signal' : 'text-t50',
              )}
            >
              {did}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 gap-1.5 text-meta text-t50">
          {group && !inGroup && (
            <span
              data-testid="rule-group"
              className="max-w-[45%] flex-none truncate text-t65"
            >
              {group.name}
            </span>
          )}
          <span className="min-w-0 truncate font-mono">{matchLine(rule)}</span>
        </div>
      </div>
    </div>
  );
}
