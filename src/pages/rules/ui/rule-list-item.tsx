// One rule in the list: its switch (the green dot), its name, and what it matches and does. Its
// place in the list is its priority. Click it to open it; drag it to reorder.
import { memo } from 'react';
import { ruleTitle } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
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
  onSelect: (id: string) => void;
}

// Whether a row would draw the same: its rule unchanged (the same copy at the same revision), as
// selected as it was, and where it stands in a drag too. Its switch draws again by itself when
// Ghostfetch is turned on or off (RuleSwitch).
function drawsTheSame(before: RuleListItemProps, after: RuleListItemProps) {
  return (
    before.rule === after.rule &&
    before.revision === after.revision &&
    before.selected === after.selected &&
    before.drag.drop === after.drag.drop &&
    before.drag.dragging === after.drag.dragging &&
    before.drag.handlers === after.drag.handlers &&
    before.onSelect === after.onSelect
  );
}

// Memoized: the list draws again on every change to any rule (a keystroke in one's body), and a
// row only when its own rule changed.
export const RuleListItem = memo(function RuleListItem({
  rule,
  selected,
  drag,
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
      // A click on the rule's switch (or on the hidden checkbox Base UI clicks for it)
      // turns the rule on or off without opening it.
      onClick={(event) => {
        if (!(event.target as Element).closest('[data-slot="switch"], input'))
          onSelect(rule.id);
      }}
      {...drag.handlers}
    >
      {/* The dot lines up with the row's text, 12 px in, and with the name's line. */}
      <RuleSwitch rule={rule} className="-my-0.5 -ml-[9px] self-start" />
      <ItemContent>
        <ItemTitle>{ruleTitle(rule)}</ItemTitle>
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
