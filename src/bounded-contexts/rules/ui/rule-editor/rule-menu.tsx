// A rule's ⋯ menu: duplicate it, move it to a group or out of one, export it, or delete it (with
// Undo in the toast, which puts it back where it was, in its group). The open rule's, in its header
// (RuleMenu), and its row's in the list (the ⋯ in the row's slot, rule-list-item.tsx) are one list
// of items (RuleMenuItems), so the two can't drift apart. The open rule's is one menu for two
// controls, as the list's rows share theirs (row-tools.ts): its ⋯ (RuleMenuButton) at the
// header's right end, and its name, a crumb at the header's left (rule-crumbs.tsx), each opening
// it under itself.
import {
  NEW_GROUP,
  addGroup,
  addRule,
  createGroup,
  freeName,
  moveRule,
  placeOf,
  removeRule,
  ruleStore,
  ruleTitle,
} from '../../index.ts';
import type { Rule } from '../../index.ts';
import { duplicateRule } from '../../application/duplicate-rule.ts';
import { useStore } from '../../../../ui/use-store.ts';
import { Button } from '../../../../ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../../../ui/kit/dropdown-menu.tsx';
import type { MenuHandle } from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { notify } from '../../../../ui/kit/toast.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import { exportRule } from '../rules-file.tsx';
import { setRenaming } from '../renaming.ts';

// No group, as the radio group's value: not an id a group can have.
const NONE = '*none';

// Which of the open rule's two controls opened its menu: the ⋯, or its name's crumb.
export type RuleMenuFrom = 'more' | 'name';

// The open rule's menu, drawn once for both: under the ⋯, right edges lined up; under the crumb,
// left edges.
export function RuleMenu({
  handle,
  rule,
  onSelect,
}: {
  handle: MenuHandle<RuleMenuFrom>;
  rule: Rule;
  onSelect: (id: string | null) => void;
}) {
  return (
    <DropdownMenu handle={handle}>
      {({ payload }) => (
        <DropdownMenuContent align={payload === 'name' ? 'start' : 'end'}>
          <RuleMenuItems rule={rule} open onSelect={onSelect} />
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

export function RuleMenuButton({ handle }: { handle: MenuHandle<RuleMenuFrom> }) {
  return (
    <Tooltip label="More actions">
      <DropdownMenuTrigger
        handle={handle}
        payload="more"
        render={
          <Button
            size="icon"
            aria-label="More actions"
            data-testid="rule-menu"
            className="border border-input"
          />
        }
      >
        <Icon name="more" size={18} />
      </DropdownMenuTrigger>
    </Tooltip>
  );
}

// The menu's items, in a DropdownMenuContent. Duplicate opens the copy; Delete closes the rule if
// it's the open one (`open`), and Undo opens it again, while a rule deleted from its row with
// another one open leaves that one open.
export function RuleMenuItems({
  rule,
  open,
  onSelect,
}: {
  rule: Rule;
  open: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { groups } = useStore(ruleStore);

  function remove() {
    const removed = removeRule(rule.id);
    if (open) onSelect(null);
    notify(`Deleted “${ruleTitle(rule)}”`, {
      icon: 'trash',
      action: 'Undo',
      onAction: () => {
        addRule(removed!.rule, removed!.place);
        if (open) onSelect(removed!.rule.id);
      },
    });
  }

  // Into a group, at its top; out of one, just above it, so it's tried about where it was.
  function moveTo(group: string) {
    if (group === rule.group) return;
    if (group) {
      moveRule(rule.id, { group, index: 0 });
      return;
    }
    const at = ruleStore.state.entries.findIndex(
      (entry) => entry.kind === 'group' && entry.group.id === rule.group,
    );
    moveRule(rule.id, { group: '', index: Math.max(at, 0) });
  }

  // A new group at the top of the list with the rule in it, its name ready to type.
  function moveToNew() {
    const group = addGroup(createGroup(freeName(NEW_GROUP, ruleStore.state.groups)), 0);
    moveRule(rule.id, { group: group.id, index: 0 });
    setRenaming(group.id);
  }

  return (
    <>
      <DropdownMenuItem onClick={() => onSelect(duplicateRule(rule))}>
        <Icon name="copy" /> Duplicate
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid="move-to-group">
          <Icon name="group" /> Move to group
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={placeOf(rule.id)?.group || NONE}
            onValueChange={(next: string) => moveTo(next === NONE ? '' : next)}
          >
            <DropdownMenuRadioItem value={NONE} closeOnClick data-testid="move-to-none">
              No group
            </DropdownMenuRadioItem>
            {groups.map((group) => (
              <DropdownMenuRadioItem
                key={group.id}
                value={group.id}
                closeOnClick
                data-testid="move-to"
                data-group={group.name}
              >
                <span className="min-w-0 truncate">{group.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="move-to-new" onClick={moveToNew}>
            <Icon name="newgroup" /> New group…
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onClick={() => exportRule(rule)}>
        <Icon name="export" /> Export this rule
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" data-testid="delete-rule" onClick={remove}>
        <Icon name="close" /> Delete
      </DropdownMenuItem>
    </>
  );
}
