// One rule in the list: its name, with what it's doing at the right (what it did on the page the
// editor watches, or Off), and what it matches and does. There's nothing here to turn it on or off:
// the toolbar popup does that. Its place in the list is its priority. Click it to open it; drag it
// to reorder.
import { memo } from 'react';
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
import { SignalDot } from '../../../shared/ui/kit/signal-dot.tsx';
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
// selected as it was, and where it stands in a drag too. What it's doing draws again by itself
// (RuleSignal).
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
  // An unnamed rule already shows its URL as the title.
  const pattern = rule.name.trim()
    ? [rule.match.url, rule.match.graphqlOperation].filter(Boolean).join(' ')
    : '';
  return (
    <Item
      variant="rule"
      data-testid="rule"
      selected={selected}
      off={!rule.enabled}
      title={rule.match.url}
      draggable
      data-drop={drag.drop}
      className={cn(DROP_MARK, drag.dragging && 'opacity-40')}
      onClick={() => onSelect(rule.id)}
      {...drag.handlers}
    >
      <ItemContent>
        <div className="flex min-w-0 items-center gap-2">
          <ItemTitle className="min-w-0">{ruleTitle(rule)}</ItemTitle>
          <RuleSignal rule={rule} log={log} />
        </div>
        <ItemDescription>
          {rule.match.method !== 'ANY' && (
            <span className="flex-none font-mono font-medium text-t80">
              {rule.match.method}
            </span>
          )}
          {pattern && (
            <span className="max-w-[62%] flex-none truncate font-mono text-t65">
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

// At the right of the name: what the rule did on the page, by a pulsing green dot, while it's on
// and Ghostfetch is recording; Off for a rule that's off, as the popup says it; nothing for one
// that's on but hasn't answered there. It draws again by itself when Ghostfetch or recording is
// turned on or off and when the rule answers on the page, so the row doesn't have to.
function RuleSignal({ rule, log }: { rule: Rule; log: TrafficLog }) {
  const { enabled, record } = useStore(settingsStore);
  const did = useTrafficValue(log, (traffic) =>
    countWords(countRule(traffic.entries, rule.id)),
  );
  if (!rule.enabled)
    return (
      <span
        data-testid="rule-signal"
        className="ml-auto flex flex-none items-center gap-1.5 text-label text-t40"
      >
        <SignalDot on={false} />
        Off
      </span>
    );
  if (!record || !did) return null;
  return (
    <span
      data-testid="rule-signal"
      className="ml-auto flex flex-none items-center gap-1.5 text-label text-signal"
    >
      <SignalDot on paused={!enabled} />
      {did}
    </span>
  );
}
