// The bar across the top of a rule: back to the sidebar (in a narrow panel), where you are (beside
// the sidebar), Duplicate (where there's room for the word) and its ⋯ menu. The rule's switch is
// its dot in the list and in the popup, and Ghostfetch's own switch is the popup's.
import { ruleTitle } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { duplicateRule } from '../../model/duplicate-rule.ts';
import { RulesHead } from '../rules-head.tsx';
import { RuleMenu } from './rule-menu.tsx';

export function RuleHeader({
  rule,
  onSelect,
}: {
  rule: Rule;
  onSelect: (id: string | null) => void;
}) {
  return (
    <RulesHead
      title={ruleTitle(rule)}
      backTestId="rule-back"
      onBack={() => onSelect(null)}
    >
      <Button
        data-testid="duplicate-rule"
        onClick={() => onSelect(duplicateRule(rule))}
        className="hidden @[640px]/main:inline-flex"
      >
        <Icon name="copy" size={14} />
        Duplicate
      </Button>
      <RuleMenu rule={rule} onSelect={onSelect} />
    </RulesHead>
  );
}
