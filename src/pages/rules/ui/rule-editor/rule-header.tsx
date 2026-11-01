// The bar across the top of a rule: back to the list (in a narrow panel), the rule's name, its
// switch (the green square) and its ⋯ menu.
import { editRule } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { BackButton, PaneHead } from '../../../../shared/ui/list-detail.tsx';
import { RuleSwitch } from '../../../../shared/ui/rule-switch.tsx';
import { RuleMenu } from './rule-menu.tsx';

export function RuleHeader({
  rule,
  onSelect,
}: {
  rule: Rule;
  onSelect: (id: string | null) => void;
}) {
  const { match } = rule;
  return (
    <PaneHead>
      <BackButton
        title="All rules"
        data-testid="rule-back"
        onClick={() => onSelect(null)}
      />
      <Input
        variant="bare"
        data-testid="rule-name"
        aria-label="Rule name"
        value={rule.name}
        placeholder={match.graphqlOperation || match.url || 'Name this rule'}
        onChange={(event) =>
          editRule(rule.id, (current) => {
            current.name = event.target.value;
          })
        }
        className="flex-1 px-3.5 text-title font-medium text-white placeholder:text-t40 hover:bg-hover focus:bg-pressed"
      />
      {/* The rule's switch fills a cell, so the whole cell is clickable. */}
      <RuleSwitch
        rule={rule}
        data-testid="rule-switch"
        className="h-auto w-14 self-stretch border-l border-border hover:bg-hover"
      />
      <RuleMenu rule={rule} onSelect={onSelect} />
    </PaneHead>
  );
}
