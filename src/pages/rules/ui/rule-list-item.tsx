// One rule in the list: its switch (the green dot), its name, with what it did on the page the
// editor watches at the right ("1 mocked"), and what it matches and does. Its place in the list is
// its priority. Click it to open it, or its dot to turn it on or off without opening it; drag it
// to reorder. Under the pointer, a name or URL the row cuts short shows whole in a tooltip.
import { memo } from 'react';
import type { PointerEvent } from 'react';
import {
  countRule,
  countWords,
  ruleTitle,
  settingsStore,
} from '../../../shared/api/index.ts';
import type { Rule, TrafficLog } from '../../../shared/api/index.ts';
import { useStore, useTrafficValue } from '../../../shared/react/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '../../../shared/ui/kit/item.tsx';
import { RuleSwitch } from '../../../shared/ui/rule-switch.tsx';
import { ruleSummary } from '../lib/rule-summary.ts';
import type { RowDrag } from '../model/use-rule-drag.ts';

// The line where a dragged rule would land, above or below the rule under the pointer.
const DROP_MARK = cn(
  "data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-px data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-foreground data-[drop=before]:before:content-['']",
  "data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-px data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-foreground data-[drop=after]:after:content-['']",
);

interface RuleListItemProps {
  rule: Rule;
  // The rule's revision (ruleRevision()): the rule is changed in place, so this is what moves.
  revision: number;
  selected: boolean;
  drag: RowDrag;
  // The editor's log of the page it watches, for what the rule did there.
  log: TrafficLog;
  onSelect: (id: string) => void;
}

// Whether a row would draw the same: its rule unchanged (the same copy at the same revision), as
// selected as it was, and where it stands in a drag too. What it did draws again by itself
// (RuleDid), and so does its switch when Ghostfetch is turned on or off (RuleSwitch).
function drawsTheSame(before: RuleListItemProps, after: RuleListItemProps) {
  return (
    before.rule === after.rule &&
    before.revision === after.revision &&
    before.selected === after.selected &&
    before.drag.drop === after.drag.drop &&
    before.drag.dragging === after.drag.dragging &&
    before.drag.handlers === after.drag.handlers &&
    before.log === after.log &&
    before.onSelect === after.onSelect
  );
}

// Memoized: the list draws again on every change to any rule (a keystroke in one's body), and a
// row only when its own rule changed.
export const RuleListItem = memo(function RuleListItem({
  rule,
  selected,
  drag,
  log,
  onSelect,
}: RuleListItemProps) {
  const title = ruleTitle(rule);
  // An unnamed rule already shows its URL as the title.
  const pattern = rule.name.trim()
    ? [rule.match.url, rule.match.graphqlOperation].filter(Boolean).join(' ')
    : '';
  return (
    <Item
      variant="rule"
      data-testid="rule"
      // What the rule matches, for the tests to find it by.
      data-url={rule.match.url}
      selected={selected}
      off={!rule.enabled}
      draggable
      data-drop={drag.drop}
      className={cn(DROP_MARK, drag.dragging && 'opacity-40')}
      // A click on the rule's switch (or on the hidden checkbox Base UI clicks for it) turns the
      // rule on or off without opening it.
      onClick={(event) => {
        if (!(event.target as Element).closest('[data-slot="switch"], input'))
          onSelect(rule.id);
      }}
      onPointerEnter={tipWhenCut}
      {...drag.handlers}
    >
      {/* The dot lines up with the row's text, 12 px in, and with the name's line. */}
      <RuleSwitch rule={rule} className="-my-0.5 -ml-[9px] self-start" />
      <ItemContent>
        <div className="flex min-w-0 items-center gap-2">
          <ItemTitle className="min-w-0" data-full={title}>
            {title}
          </ItemTitle>
          <RuleDid rule={rule} log={log} />
        </div>
        <ItemDescription>
          {rule.match.method !== 'ANY' && (
            <span className="flex-none font-mono font-medium text-t80">
              {rule.match.method}
            </span>
          )}
          {pattern && (
            <span
              data-full={pattern}
              className="max-w-[62%] flex-none truncate font-mono text-t65"
            >
              {pattern}
            </span>
          )}
          {/* the summary gives way before the URL does */}
          <span className="min-w-0 flex-[0_10_auto] truncate text-t40">
            {ruleSummary(rule)}
          </span>
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}, drawsTheSame);

// The row's tooltip, set as the pointer comes: the name or the URL in full, only where the row
// cuts it short (data-full holds it whole). A row that shows both whole has none, so there's no
// tooltip saying again what it says.
function tipWhenCut(event: PointerEvent<HTMLElement>) {
  const row = event.currentTarget;
  const cut = [...row.querySelectorAll<HTMLElement>('[data-full]')]
    .filter((part) => part.scrollWidth > part.clientWidth)
    .map((part) => part.dataset.full);
  if (cut.length) row.title = cut.join('\n');
  else row.removeAttribute('title');
}

// At the right of the name: what the rule did on the page ("1 mocked"), while it's on and
// Ghostfetch is recording, in green, or grey while Ghostfetch is paused; nothing for a rule that
// hasn't answered there, or is off (its dot says so). It draws again by itself when Ghostfetch or
// recording is turned on or off and when the rule answers on the page, so the row doesn't have to.
function RuleDid({ rule, log }: { rule: Rule; log: TrafficLog }) {
  const { enabled, record } = useStore(settingsStore);
  const did = useTrafficValue(log, (traffic) =>
    countWords(countRule(traffic.entries, rule.id)),
  );
  if (!rule.enabled || !record || !did) return null;
  return (
    <span
      data-testid="rule-signal"
      className={cn('ml-auto flex-none text-label', enabled ? 'text-signal' : 'text-t50')}
    >
      {did}
    </span>
  );
}
