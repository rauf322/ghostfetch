// The rules in the sidebar, in two groups: the ones that are on, then the ones that are off, each
// in its order (a rule's place in the list is its priority: rules are tried top to bottom, and the
// first match wins; drag one to move it within its group). The + by the first group's label makes
// a new rule. Search narrows both groups.
import type { ReactNode } from 'react';
import { ruleStore } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { ListEmpty } from '../../../shared/ui/list-detail.tsx';
import { filterRules } from '../lib/filter-rules.ts';
import { useRuleDrag } from '../model/use-rule-drag.ts';
import type { RowDrag } from '../model/use-rule-drag.ts';
import { NoRulesYet } from './no-rules.tsx';
import { RuleListItem } from './rule-list-item.tsx';

interface RuleListProps {
  selectedId: string | null;
  query: string;
  onSelect: (id: string) => void;
  // New rule: the + by the first group.
  onCreate: () => void;
}

export function RuleList({ selectedId, query, onSelect, onCreate }: RuleListProps) {
  const { rules } = useStore(ruleStore);
  const drag = useRuleDrag(rules);
  const visible = filterRules(rules, query);
  const on = visible.filter((rule) => rule.enabled);
  const off = visible.filter((rule) => !rule.enabled);
  const none = Boolean(rules.length) && !visible.length;
  const group = (label: string, shown: Rule[], action?: ReactNode) => (
    <RuleGroup
      label={label}
      rules={shown}
      selectedId={selectedId}
      drag={drag}
      onSelect={onSelect}
      action={action}
    />
  );

  return (
    <div
      data-testid="rule-list"
      className="min-h-0 flex-1 overflow-auto py-1 scroll-thin"
    >
      {none && (
        <ListEmpty>
          <p>{`No rules match “${query}”.`}</p>
        </ListEmpty>
      )}
      {/* The first group stays while nothing is searched for, as its + is the way to a new rule. */}
      {!none &&
        (on.length || !query) &&
        group(
          'On',
          on,
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="new-rule"
            aria-label="New rule"
            title="New rule"
            onClick={onCreate}
            className="-my-1 -mr-1.5"
          >
            <Icon name="plus" size={15} />
          </Button>,
        )}
      {!rules.length && <NoRulesYet />}
      {Boolean(off.length) && group('Off', off)}
    </div>
  );
}

// A group's label with its count ("On · 4"), what goes at its right end, and its rules.
function RuleGroup({
  label,
  rules,
  selectedId,
  drag,
  onSelect,
  action,
}: {
  label: string;
  rules: Rule[];
  selectedId: string | null;
  drag: (rule: Rule) => RowDrag;
  onSelect: (id: string) => void;
  action?: ReactNode;
}) {
  return (
    <section>
      {/* The label starts over the rules' dots. */}
      <div className="flex h-9 items-center justify-between pt-2 pr-2 pl-[22px]">
        <h2 className="text-label font-medium text-t40 tabular-nums">
          {label} · {rules.length}
        </h2>
        {action}
      </div>
      <ul>
        {rules.map((rule) => (
          <RuleListItem
            key={rule.id}
            rule={rule}
            selected={rule.id === selectedId}
            drag={drag(rule)}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  );
}
