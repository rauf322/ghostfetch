// The Rules tab's list: search and New rule along the top, how many rules are on, the rules in
// their order (which is their priority), and Import and Export along the bottom.
import { ruleStore } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
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
} from '../../../shared/ui/list-detail.tsx';
import { filterRules } from '../lib/filter-rules.ts';
import { useRuleDrag } from '../model/use-rule-drag.ts';
import { NoRulesYet } from './no-rules.tsx';
import { RuleListItem } from './rule-list-item.tsx';

interface RuleListProps {
  selectedId: string | null;
  // A rule is open, which hides the list in a narrow panel.
  picked: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
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
  const { rules } = useStore(ruleStore);
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
        <Button variant="primary" size="sm" data-testid="new-rule" onClick={onCreate}>
          <Icon name="plus" size={14} />
          New rule
        </Button>
      </PaneToolbar>
      <SectionRow>
        <Label>Rules</Label>
        <Label className="tabular-nums">
          {rules.length ? `${active} of ${rules.length} on` : ''}
        </Label>
      </SectionRow>

      <List>
        {!rules.length && <NoRulesYet />}
        {Boolean(rules.length) && !visible.length && (
          <ListEmpty>
            <p>{`No rules match “${query}”.`}</p>
          </ListEmpty>
        )}
        {visible.map((rule) => (
          <RuleListItem
            key={rule.id}
            rule={rule}
            selected={rule.id === selectedId}
            drag={drag(rule)}
            onSelect={onSelect}
          />
        ))}
      </List>

      <PaneFooter>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-2.5 text-label whitespace-nowrap text-t30">
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
