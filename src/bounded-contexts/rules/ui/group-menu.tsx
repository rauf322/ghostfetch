// A group's ⋯ menu: rename it, duplicate it, export it with its rules, take it away and leave its
// rules where it was (Ungroup), or delete it with its rules (with Undo in the toast).
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
import { notify } from '../../../ui/kit/toast.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { exportGroup } from './rules-file.tsx';

export function GroupMenu({
  group,
  onRename,
}: {
  group: Group;
  // A group to rename now: this one, or its copy.
  onRename: (id: string) => void;
}) {
  function remove() {
    const removed = removeGroup(group.id);
    if (!removed) return;
    const count = removed.rules.length;
    notify(
      `Deleted “${group.name}”${count ? ` and its ${count === 1 ? 'rule' : `${count} rules`}` : ''}`,
      {
        icon: 'trash',
        action: 'Undo',
        onAction: () => restoreGroup(removed),
      },
    );
  }

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
            />
          }
        >
          <Icon name="more" size={15} />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onRename(group.id)}>
          <Icon name="edit" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="duplicate-group"
          onClick={() => onRename(duplicateGroup(group).id)}
        >
          <Icon name="copy" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportGroup(group)}>
          <Icon name="export" /> Export group
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="ungroup" onClick={() => ungroup(group.id)}>
          <Icon name="list" /> Ungroup
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          data-testid="delete-group"
          onClick={remove}
        >
          <Icon name="close" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
