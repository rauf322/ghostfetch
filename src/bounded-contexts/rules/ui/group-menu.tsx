// A group's ⋯ menu: rename it, duplicate it, export it with its rules, take it away and leave its
// rules where it was (Ungroup), or delete it with its rules (with Undo, which brings them back
// where they were: in the sidebar's footer, with ⌘Z, or where that isn't on screen in a toast,
// undo-delete.ts). Its ⋯ in the header (GroupMenu) and its right-click menu in the list
// (rule-list.tsx) are one list of items (GroupMenuItems), so the two can't drift apart.
import { duplicateGroup, removeGroup, restoreGroup, ungroup } from '../index.ts';
import type { Group } from '../index.ts';
import { Button } from '../../../ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { exportGroup } from './rules-file.tsx';
import { offerUndo } from './undo-delete.ts';

export function GroupMenu({
  group,
  tabIndex,
  onRename,
}: {
  group: Group;
  // -1 where it isn't a Tab stop: in a header the list's keys haven't reached (rule-list.tsx).
  tabIndex?: number;
  // A group to rename now: this one, or its copy.
  onRename: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip label="More actions">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More actions for ${group.name}`}
              data-testid="group-menu"
              tabIndex={tabIndex}
            />
          }
        >
          <Icon name="more" size={15} />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent>
        <GroupMenuItems group={group} onRename={onRename} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The menu's items, in a menu's content (its ⋯'s, or the list's right-click menu).
export function GroupMenuItems({
  group,
  onRename,
}: {
  group: Group;
  onRename: (id: string) => void;
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
      <DropdownMenuItem data-testid="rename-group" onClick={() => onRename(group.id)}>
        <Icon name="edit" /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid="duplicate-group"
        onClick={() => onRename(duplicateGroup(group).id)}
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
