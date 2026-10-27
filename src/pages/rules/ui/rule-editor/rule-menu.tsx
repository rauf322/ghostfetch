// A rule's ⋯ menu: duplicate it, export it, or delete it (with Undo in the toast).
import {
  addRule,
  normalizeRule,
  removeRule,
  ruleStore,
  ruleTitle,
} from '../../../../entities/rule/index.ts';
import type { Rule } from '../../../../entities/rule/index.ts';
import { exportRule } from '../../../../features/rules-transfer/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';

export function RuleMenu({
  rule,
  onSelect,
}: {
  rule: Rule;
  onSelect: (id: string | null) => void;
}) {
  function duplicate() {
    const copy = normalizeRule(structuredClone(rule), { newId: true });
    copy.name = `${ruleTitle(rule)} (copy)`;
    addRule(copy, ruleStore.state.rules.indexOf(rule) + 1);
    onSelect(copy.id);
  }

  function remove() {
    const removed = removeRule(rule.id);
    onSelect(null);
    notify(`Deleted “${ruleTitle(rule)}”`, {
      action: 'Undo',
      onAction: () => {
        addRule(removed!.rule, removed!.index);
        onSelect(removed!.rule.id);
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title="More actions"
            data-testid="rule-menu"
            className="h-full w-[45px] border-l border-border"
          />
        }
      >
        <Icon name="more" size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={duplicate}>
          <Icon name="copy" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportRule(rule)}>
          <Icon name="export" /> Export this rule
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          data-testid="delete-rule"
          onClick={remove}
        >
          <Icon name="close" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
