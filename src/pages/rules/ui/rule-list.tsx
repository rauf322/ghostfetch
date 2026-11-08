// The rules in the sidebar, in their order, under how many of them are on ("12 of 14 on") and
// the + that makes a new rule. A rule's place in the list is its priority: rules are tried top to
// bottom, and the first match wins; drag one to move it. A rule that's off stays where it is, its
// dot grey. Search narrows the list.
import { ruleRevision, ruleStore } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { ListEmpty } from '../../../shared/ui/list-detail.tsx';
import { filterRules } from '../lib/filter-rules.ts';
import { useRuleDrag } from '../model/use-rule-drag.ts';
import { NoRulesYet } from './no-rules.tsx';
import { RuleListItem } from './rule-list-item.tsx';

interface RuleListProps {
  selectedId: string | null;
  query: string;
  onSelect: (id: string) => void;
  // New rule: the +.
  onCreate: () => void;
}

export function RuleList({ selectedId, query, onSelect, onCreate }: RuleListProps) {
  const { rules } = useStore(ruleStore);
  const drag = useRuleDrag(rules);
  const visible = filterRules(rules, query);
  const none = Boolean(rules.length) && !visible.length;
  const on = visible.filter((rule) => rule.enabled).length;

  return (
    <div
      data-testid="rule-list"
      className="min-h-0 flex-1 overflow-auto py-1 scroll-thin"
    >
      {none ? (
        <ListEmpty>
          <p>{`No rules match “${query}”.`}</p>
        </ListEmpty>
      ) : (
        <section>
          {/* The label starts over the rules' dots. */}
          <div className="flex h-9 items-center justify-between pt-2 pr-2 pl-[22px]">
            <h2 className="text-label font-medium text-t40 tabular-nums">
              {visible.length ? `${on} of ${visible.length} on` : 'Rules'}
            </h2>
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
            </Button>
          </div>
          <ul>
            {visible.map((rule) => (
              <RuleListItem
                key={rule.id}
                rule={rule}
                revision={ruleRevision(rule)}
                selected={rule.id === selectedId}
                drag={drag(rule)}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      )}
      {!rules.length && <NoRulesYet />}
    </div>
  );
}
