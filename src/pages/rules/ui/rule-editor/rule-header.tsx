// The bar across the top of a rule: back to the sidebar (in a narrow panel), where you are (beside
// the sidebar), Duplicate (where there's room for the word), its ⋯ menu and its switch. In the
// list and the popup a rule's switch is the green dot; here, with room for a word, it's a toggle
// that says On or Off.
import { editRule, ruleTitle } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { SwitchPill } from '../../../../shared/ui/kit/switch.tsx';
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
      <SwitchPill
        data-testid="rule-switch"
        aria-label="Rule on"
        checked={rule.enabled}
        onCheckedChange={(on) =>
          editRule(rule.id, (current) => {
            current.enabled = on;
          })
        }
      >
        {rule.enabled ? 'On' : 'Off'}
      </SwitchPill>
    </RulesHead>
  );
}
