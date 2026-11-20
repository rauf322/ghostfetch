// A group's ⋯ menu: rename it, duplicate it, export it with its rules, take it away and leave its
// rules where it was (Ungroup), or delete it with its rules (with Undo in the toast).
import {
  duplicateGroup,
  removeGroup,
  restoreGroup,
  ungroup,
} from '../../../shared/api/index.ts';
import type { Group } from '../../../shared/api/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { notify } from '../../../shared/ui/kit/toast.tsx';
import { exportGroup } from '../../../shared/ui/rules-file.tsx';

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
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            title="More actions"
            aria-label={`More actions for ${group.name}`}
            data-testid="group-menu"
          />
        }
      >
        <Icon name="more" size={15} />
      </DropdownMenuTrigger>
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
