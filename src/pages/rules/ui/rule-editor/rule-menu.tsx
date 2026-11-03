// A rule's ⋯ menu: duplicate it, export it, or delete it (with Undo in the toast).
import { addRule, removeRule, ruleTitle } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';
import { exportRule } from '../../../../shared/ui/rules-file.tsx';
import { duplicateRule } from '../../model/duplicate-rule.ts';

export function RuleMenu({
  rule,
  onSelect,
}: {
  rule: Rule;
  onSelect: (id: string | null) => void;
}) {
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
            size="icon"
            title="More actions"
            data-testid="rule-menu"
            className="border border-input"
          />
        }
      >
        <Icon name="more" size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onSelect(duplicateRule(rule))}>
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
