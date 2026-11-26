// A group's menu: a new rule at its top, rename it, turn it off or on (its rules stop answering,
// each keeping its own switch), duplicate it, export it with its rules, take it away and leave its
// rules where it was (Ungroup), or delete it with its rules (with Undo, which brings them back
// where they were: in the sidebar's footer, with ⌘Z, or where that isn't on screen in a toast,
// undo-delete.ts). Its header's ⋯ (the list's one menu, row-tools.ts), its right-click menu in the
// list (rule-list.tsx) and its crumb's menu (rule-editor/rule-crumbs.tsx) are one list of items
// (GroupMenuItems), so they can't drift apart. Rename is where it was picked (the header's name, or
// the crumb); the copy's name is typed in the list, which is shown for it (renaming.ts's
// nameInList()). Turned on or off, it's saved at once, as its rules' dots are.
import {
  duplicateGroup,
  removeGroup,
  restoreGroup,
  turnGroup,
  ungroup,
} from '../index.ts';
import type { Group } from '../index.ts';
import { DropdownMenuItem } from '../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { nameInList } from './renaming.ts';
import { exportGroup } from './rules-file.tsx';
import { offerUndo } from './undo-delete.ts';

// The menu's items, in a menu's content. `onNewRule`: New rule in this group, first, as its
// `newRuleId` (the crumb's has its own, as it had).
export function GroupMenuItems({
  group,
  onRename,
  onNewRule,
  newRuleId = 'group-new-rule',
}: {
  group: Group;
  onRename: (id: string) => void;
  onNewRule?: (group: string) => void;
  newRuleId?: string;
}) {
  function remove() {
    const removed = removeGroup(group.id);
    if (!removed) return;
    const count = removed.rules.length;
    offerUndo({
      said: 'Group deleted',
      toast: `Deleted “${group.name}”${count ? ` and its ${count === 1 ? 'rule' : `${count} rules`}` : ''}`,
      item: group.id,
      undo: () => restoreGroup(removed),
    });
  }

  return (
    <>
      {onNewRule && (
        <DropdownMenuItem data-testid={newRuleId} onClick={() => onNewRule(group.id)}>
          <Icon name="plus" /> New rule in this group
        </DropdownMenuItem>
      )}
      <DropdownMenuItem data-testid="rename-group" onClick={() => onRename(group.id)}>
        <Icon name="edit" /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="turn-group"
        onClick={() => turnGroup(group.id, !group.enabled)}
      >
        <Icon name="power" /> {group.enabled ? 'Turn the group off' : 'Turn the group on'}
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="duplicate-group"
        onClick={() => nameInList(duplicateGroup(group).id)}
      >
        <Icon name="copy" /> Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem data-testid="export-group" onClick={() => exportGroup(group)}>
        <Icon name="export" /> Export group
      </DropdownMenuItem>
      <DropdownMenuItem data-testid="ungroup" onClick={() => ungroup(group.id)}>
        <Icon name="list" /> Ungroup
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" data-testid="delete-group" onClick={remove}>
        <Icon name="close" /> Delete
      </DropdownMenuItem>
    </>
  );
}
