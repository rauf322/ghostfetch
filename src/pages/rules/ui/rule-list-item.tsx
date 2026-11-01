// One rule in the list: its number (its priority), its name, what it matches and does, and its
// switch, the green dot. Click it to open it; drag it to reorder.
import { ruleTitle } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemNumber,
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

export function RuleListItem({
  rule,
  position,
  selected,
  drag,
  onSelect,
}: {
  rule: Rule;
  // The rule's place in the whole list, zero-padded ("03").
  position: string;
  selected: boolean;
  drag: RowDrag;
  onSelect: (id: string) => void;
}) {
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
      <ItemNumber>{position}</ItemNumber>
      <ItemContent>
        <ItemTitle>{ruleTitle(rule)}</ItemTitle>
        <ItemDescription>
          {rule.match.method !== 'ANY' && (
            <span className="flex-none text-control font-medium tracking-[0.04em] text-t80">
              {rule.match.method}
            </span>
          )}
          {pattern && (
            <span className="max-w-[62%] flex-none truncate text-t65">{pattern}</span>
          )}
          {/* the summary gives way before the URL does */}
          <span className="min-w-0 flex-[0_10_auto] truncate text-t30">
            {ruleSummary(rule)}
          </span>
        </ItemDescription>
      </ItemContent>
      {/* The dot sits 14 px in from the row's right edge, as the row's text does on the left. */}
      <RuleSwitch rule={rule} className="-mr-2" />
    </Item>
  );
}
