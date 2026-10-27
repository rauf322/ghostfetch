// The Rules tab's list: search and New rule along the top, how many rules are on, the rules in
// their order (numbered by priority, even while a search hides some), and Import and Export along
// the bottom.
import { ruleStore } from '../../../entities/rule/index.ts';
import type { RuleType } from '../../../entities/rule/index.ts';
import { useStore } from '../../../shared/lib/react/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { Label } from '../../../shared/ui/kit/label.tsx';
import {
  List,
  ListEmpty,
  ListPane,
  PaneFooter,
  PaneToolbar,
  SearchField,
  SectionRow,
} from '../../../shared/ui/list-detail/index.ts';
import { filterRules } from '../lib/filter-rules.ts';
import { useRuleDrag } from '../model/use-rule-drag.ts';
import { NewRuleMenu } from './new-rule-menu.tsx';
import { NoRulesYet } from './no-rules.tsx';
import { RuleListItem } from './rule-list-item.tsx';

interface RuleListProps {
  selectedId: string | null;
  // A rule is open, which hides the list in a narrow panel.
  picked: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: (type: RuleType) => void;
  onImport: () => void;
  onExport: () => void;
}

export function RuleList({
  selectedId,
  picked,
  query,
  onQueryChange,
  onSelect,
  onCreate,
  onImport,
  onExport,
}: RuleListProps) {
  const { rules, dnrErrors } = useStore(ruleStore);
  const drag = useRuleDrag(rules);
  const visible = filterRules(rules, query);
  const active = rules.filter((rule) => rule.enabled).length;

  return (
    <ListPane picked={picked}>
      <PaneToolbar>
        <SearchField
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search rules"
          aria-label="Search rules"
        />
        <NewRuleMenu onCreate={onCreate} />
      </PaneToolbar>
      <SectionRow>
        <Label>Rules</Label>
        <Label className="tracking-wider">
          {rules.length ? `${active} / ${rules.length} on` : ''}
        </Label>
      </SectionRow>

      <List>
        {!rules.length && <NoRulesYet onPick={onCreate} />}
        {Boolean(rules.length) && !visible.length && (
          <ListEmpty>
            <p>{`No rules match “${query}”.`}</p>
          </ListEmpty>
        )}
        {visible.map((rule) => (
          <RuleListItem
            key={rule.id}
            rule={rule}
            // The rule's place in the whole list, which is its priority, even while a search
            // hides some rules.
            position={String(rules.indexOf(rule) + 1).padStart(2, '0')}
            selected={rule.id === selectedId}
            error={dnrErrors[rule.id]}
            drag={drag(rule)}
            onSelect={onSelect}
          />
        ))}
      </List>

      <PaneFooter>
        <span className="flex min-w-0 flex-1 items-center gap-[7px] overflow-hidden px-3.5 text-label whitespace-nowrap uppercase tracking-caps text-t30">
          <Icon name="grip" size={13} />
          Drag to reorder
        </span>
        <Button variant="cell" size="cell" onClick={onImport}>
          Import
        </Button>
        <Button variant="cell" size="cell" onClick={onExport}>
          Export
        </Button>
      </PaneFooter>
    </ListPane>
  );
}
