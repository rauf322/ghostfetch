// A group's header in the rule list: its switch (the dot, where an ungrouped rule's is), its name,
// a button that folds the group or unfolds it (double-click it to rename the group), how many of
// its rules are on, + for a new rule at its top, and its ⋯ menu. Drag it to move the group with its
// rules. A group that's off fades, as its rules do. In the list's tree its group's block takes
// focus (group-block.tsx), and the header shows the ring; its controls are Tab stops only while
// the block is the list's (`tabbable`), and the fold button never is, as the list's keys fold.
import { groupName, renameGroup } from '../index.ts';
import type { Group, Rule } from '../index.ts';
import { cn } from '../../../ui/cn.ts';
import { GroupSwitch } from './group-switch.tsx';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { notify } from '../../../ui/kit/toast.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import type { HeaderDrag } from './use-rule-drag.ts';
import { DROP_MARK, INTO_MARK } from './drop-marks.ts';
import { GroupMenu } from './group-menu.tsx';
import { RenameField } from './rename-field.tsx';

export function GroupHeader({
  group,
  rules,
  folded,
  renaming,
  tabbable,
  nameId,
  drag,
  onFold,
  onRename,
  onRenamed,
  onCreate,
}: {
  group: Group;
  // All of its rules, whatever the search shows of them.
  rules: Rule[];
  folded: boolean;
  // Its name is a field, to type a new one in.
  renaming: boolean;
  // Its block is the list's Tab stop.
  tabbable: boolean;
  // The id of its name, which names its block in the tree.
  nameId: string;
  drag: HeaderDrag;
  onFold: () => void;
  onRename: (id: string) => void;
  // Done renaming it: by Enter or Esc (byKey), or by leaving the field.
  onRenamed: (byKey: boolean) => void;
  // New rule, in this group.
  onCreate: (group: string) => void;
}) {
  const on = rules.filter((rule) => rule.enabled).length;
  const tabIndex = tabbable ? 0 : -1;
  return (
    <div
      data-testid="group"
      // Where the group's right-click menu opens from the keyboard (context-menu.tsx).
      data-menu-anchor
      data-group={group.name}
      data-off={!group.enabled || undefined}
      data-drop={drag.drop}
      draggable={!renaming}
      {...drag.handlers}
      className={cn(
        'group/head relative mx-1.5 flex h-[38px] items-center gap-1 rounded-md pr-1 pl-3 hover:bg-hover group-data-context-open/block:bg-hover group-focus-visible/block:ring-[1.5px] group-focus-visible/block:ring-t65 group-focus-visible/block:ring-inset',
        DROP_MARK,
        INTO_MARK,
      )}
    >
      {/* The dot lines up with an ungrouped rule's, and its rules' with its name. */}
      <GroupSwitch group={group} tabIndex={tabIndex} className="-ml-[9px]" />
      {renaming ? (
        <RenameField
          name={group.name}
          label="Group name"
          testId="group-name-input"
          maxLength={100}
          tidy={groupName}
          rename={(name) => {
            if (renameGroup(group.id, name) !== 'taken') return true;
            notify(`There's already a group called “${name}”`, {
              kind: 'error',
              description: 'Each group has a name of its own: pick another.',
            });
            return false;
          }}
          onDone={onRenamed}
          className="font-semibold"
        />
      ) : (
        // How many of its rules are on, too, which the header shows only where there's room.
        <Tooltip
          label={`${rules.length ? `${on} of ${rules.length} on. ` : ''}Click to ${folded ? 'unfold' : 'fold'} it, double-click to rename it`}
        >
          <button
            type="button"
            data-testid="group-name"
            aria-expanded={!folded}
            tabIndex={-1}
            onClick={onFold}
            onDoubleClick={() => onRename(group.id)}
            className="flex min-w-0 items-center gap-1 text-left text-title font-semibold text-strong group-data-off/head:text-t50"
          >
            <span id={nameId} className="truncate">
              {group.name}
            </span>
            <Icon
              name={folded ? 'forward' : 'down'}
              size={14}
              className="flex-none text-t40"
            />
          </button>
        </Tooltip>
      )}
      <span
        data-testid="group-count"
        // Where the sidebar has room for it.
        className="ml-auto hidden flex-none pl-2 text-label text-t40 tabular-nums @[300px]/rules:inline"
      >
        {rules.length ? `${on} of ${rules.length} on` : ''}
      </span>
      <Tooltip label={`New rule in ${group.name}`}>
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="group-new-rule"
          aria-label={`New rule in ${group.name}`}
          tabIndex={tabIndex}
          onClick={() => onCreate(group.id)}
          className="ml-auto @[300px]/rules:ml-0"
        >
          <Icon name="plus" size={15} />
        </Button>
      </Tooltip>
      <GroupMenu group={group} tabIndex={tabIndex} onRename={onRename} />
    </div>
  );
}
