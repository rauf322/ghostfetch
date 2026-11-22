// A group's header in the rule list: its switch (the dot, where an ungrouped rule's is), its name,
// a button that folds the group or unfolds it (double-click it to rename the group), how many of
// its rules are on, + for a new rule at its top, and its ⋯ menu. Drag it to move the group with its
// rules. A group that's off fades, as its rules do.
import { useEffect, useRef, useState } from 'react';
import { groupName, renameGroup } from '../index.ts';
import type { Group, Rule } from '../index.ts';
import { cn } from '../../ui/cn.ts';
import { GroupSwitch } from './group-switch.tsx';
import { Button } from '../../ui/kit/button.tsx';
import { Icon } from '../../ui/kit/icon.tsx';
import { notify } from '../../ui/kit/toast.tsx';
import type { HeaderDrag } from './use-rule-drag.ts';
import { DROP_MARK, INTO_MARK } from './drop-marks.ts';
import { GroupMenu } from './group-menu.tsx';

export function GroupHeader({
  group,
  rules,
  folded,
  renaming,
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
  drag: HeaderDrag;
  onFold: () => void;
  onRename: (id: string) => void;
  onRenamed: () => void;
  // New rule, in this group.
  onCreate: (group: string) => void;
}) {
  const on = rules.filter((rule) => rule.enabled).length;
  return (
    <div
      data-testid="group"
      data-group={group.name}
      data-off={!group.enabled || undefined}
      data-drop={drag.drop}
      draggable={!renaming}
      {...drag.handlers}
      className={cn(
        'group/head relative mx-1.5 flex h-[38px] items-center gap-1 rounded-md pr-1 pl-3 hover:bg-hover',
        DROP_MARK,
        INTO_MARK,
      )}
    >
      {/* The dot lines up with an ungrouped rule's, and its rules' with its name. */}
      <GroupSwitch group={group} className="-ml-[9px]" />
      {renaming ? (
        <NameField group={group} onDone={onRenamed} />
      ) : (
        <button
          type="button"
          data-testid="group-name"
          aria-expanded={!folded}
          // How many of its rules are on, too, which the header shows only where there's room.
          title={`${rules.length ? `${on} of ${rules.length} on. ` : ''}Click to ${folded ? 'unfold' : 'fold'} it, double-click to rename it`}
          onClick={onFold}
          onDoubleClick={() => onRename(group.id)}
          className="flex min-w-0 items-center gap-1 text-left text-title font-semibold text-strong group-data-off/head:text-t50"
        >
          <span className="truncate">{group.name}</span>
          <Icon
            name={folded ? 'forward' : 'down'}
            size={14}
            className="flex-none text-t40"
          />
        </button>
      )}
      <span
        data-testid="group-count"
        // Where the sidebar has room for it.
        className="ml-auto hidden flex-none pl-2 text-label text-t40 tabular-nums @[300px]/rules:inline"
      >
        {rules.length ? `${on} of ${rules.length} on` : ''}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid="group-new-rule"
        aria-label={`New rule in ${group.name}`}
        title={`New rule in ${group.name}`}
        onClick={() => onCreate(group.id)}
        className="ml-auto @[300px]/rules:ml-0"
      >
        <Icon name="plus" size={15} />
      </Button>
      <GroupMenu group={group} onRename={onRename} />
    </div>
  );
}

// The group's name as a field: Enter or leaving it renames the group, Esc keeps the name it had.
// A name that's empty is the one it had; one another group has (names are unique, ignoring case)
// is turned down with a toast, the field kept open for another.
function NameField({ group, onDone }: { group: Group; onDone: () => void }) {
  const [text, setText] = useState(group.name);
  const field = useRef<HTMLInputElement>(null);
  // Done once: a field that goes away can still lose focus on its way.
  const done = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  function finish() {
    done.current = true;
    onDone();
  }

  function commit() {
    if (done.current) return;
    const name = groupName(text);
    if (name && name !== group.name && renameGroup(group.id, name) === 'taken') {
      notify(`There's already a group called “${name}”`, {
        kind: 'error',
        description: 'Each group has a name of its own: pick another.',
      });
      return;
    }
    finish();
  }

  return (
    <input
      ref={field}
      data-testid="group-name-input"
      aria-label="Group name"
      value={text}
      maxLength={100}
      spellCheck={false}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish();
        }
      }}
      onBlur={commit}
      className="h-7 min-w-0 flex-1 rounded-sm bg-pressed px-1.5 text-title font-semibold text-strong outline-none"
    />
  );
}
