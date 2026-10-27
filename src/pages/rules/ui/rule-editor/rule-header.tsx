// The bar across the top of a rule: back to the list (in a narrow panel), the rule's name, its
// switch and its ⋯ menu.
import type { Rule } from '../../../../entities/rule/index.ts';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { Switch } from '../../../../shared/ui/kit/switch.tsx';
import { BackButton, PaneHead } from '../../../../shared/ui/list-detail/index.ts';
import { editRule } from '../../model/edit-rule.ts';
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
      {/* The rule's own switch fills a cell, so the whole cell is clickable. The words are
          for screen readers; the title is the same words on hover. */}
      <label
        title="Turn this rule on or off"
        className="flex w-14 flex-none cursor-pointer items-center justify-center border-l border-border"
      >
        <span className="sr-only">Turn this rule on or off</span>
        <Switch
          checked={rule.enabled}
          onCheckedChange={(on) =>
            editRule(rule.id, (current) => {
              current.enabled = on;
            })
          }
          className="data-[size=default]:h-[13px] data-[size=default]:w-[25px]"
        />
      </label>
      <RuleMenu rule={rule} onSelect={onSelect} />
    </PaneHead>
  );
}
