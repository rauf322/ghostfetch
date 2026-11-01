// The bar across the top of a rule: back to the list (in a narrow panel), where you are (beside
// the list), its ⋯ menu and its switch. In the list and the popup a rule's switch is the green dot;
// here, with room for a word, it's a toggle that says On or Off.
import { editRule, ruleTitle } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Switch } from '../../../../shared/ui/kit/switch.tsx';
import { PaneHead } from '../../../../shared/ui/list-detail.tsx';
import { RuleMenu } from './rule-menu.tsx';

export function RuleHeader({
  rule,
  onSelect,
}: {
  rule: Rule;
  onSelect: (id: string | null) => void;
}) {
  return (
    <PaneHead className="h-12 items-center gap-1.5 border-b-0 px-2">
      <Button
        variant="ghost"
        size="sm"
        title="All rules"
        data-testid="rule-back"
        onClick={() => onSelect(null)}
        className="gap-1 pr-2.5 pl-1 text-control text-t80 wide:hidden"
      >
        <Icon name="back" size={18} />
        Rules
      </Button>
      <span className="hidden min-w-0 truncate px-2.5 text-control text-t40 wide:block">
        {'Rules '}
        <span className="text-t30">/</span>{' '}
        <span className="text-t80">{ruleTitle(rule)}</span>
      </span>
      <span className="ml-auto" />
      <RuleMenu rule={rule} onSelect={onSelect} />
      <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md bg-card pr-1.5 pl-3 text-control font-medium text-t80">
        {rule.enabled ? 'On' : 'Off'}
        <Switch
          data-testid="rule-switch"
          aria-label="Rule on"
          checked={rule.enabled}
          onCheckedChange={(on) =>
            editRule(rule.id, (current) => {
              current.enabled = on;
            })
          }
        />
      </label>
    </PaneHead>
  );
}
