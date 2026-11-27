// A group's header in the rule list, after variant A's: a chevron where a rule's dot is, the
// group's chip (kit/monogram.tsx) where rules' names start, its name, and at its right end its
// slot (the kit's ItemSlot), which says how many rules it has, or "Off", and in their place under
// the pointer, with focus, or while its menu is open, Turn the group off (or on) and its ⋯, as a
// rule row's slot has them: the list's one tooltip each and its one ⋯ menu (row-tools.ts), whose
// items are the group's right-click menu's (group-menu.tsx). A click on the chevron, the chip or
// the name folds the group or unfolds it; a double-click renames it there. Drag it to move the
// group with its rules. A group that's off steps back: its name in the grey of muted text, its chip
// grey, and its rules fade. In the list's tree its group's block takes focus (group-block.tsx),
// which the header shows with the ring and its slot with its actions; they're Tab stops only while
// the block is the list's (`tabbable`), and the fold button never is, as the list's keys fold.
import { useEffect, useMemo, useRef, useState } from 'react';
import { groupName, turnGroup } from '../index.ts';
import type { Group, Rule } from '../index.ts';
import { cn } from '../../../ui/cn.ts';
import { DropdownMenuTrigger } from '../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { ItemAction, ItemSlot } from '../../../ui/kit/item.tsx';
import { Monogram } from '../../../ui/kit/monogram.tsx';
import { Tooltip, TooltipTrigger } from '../../../ui/kit/tooltip.tsx';
import type { HeaderDrag } from './use-rule-drag.ts';
import { DROP_MARK, INTO_MARK } from './drop-marks.ts';
import { RenameField } from './rename-field.tsx';
import { renameGroupTo } from './renaming.ts';
import { useRowTools } from './row-tools.ts';

// The slot's actions show, and what it says doesn't, while the group's block has keyboard focus or
// its right-click menu open (the block takes both): beside the header's own hover and focus.
const SHOWN =
  'group-focus-visible/block:pointer-events-auto group-focus-visible/block:opacity-100 group-data-context-open/block:pointer-events-auto group-data-context-open/block:opacity-100';
const HIDDEN =
  'group-focus-visible/block:opacity-0 group-data-context-open/block:opacity-0';

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
}: {
  group: Group;
  // All of its rules, whatever the search shows of them.
  rules: Rule[];
  folded: boolean;
  // Its name is a field, to type a new one in.
  renaming: boolean;
  // Its block is the list's Tab stop.
  tabbable: boolean;
  // The id of its name, which names its block in the tree; and with "state", of what describes it.
  nameId: string;
  drag: HeaderDrag;
  onFold: () => void;
  onRename: (id: string) => void;
  // Done renaming it: by Enter or Esc (byKey), or by leaving the field.
  onRenamed: (byKey: boolean) => void;
}) {
  // Its actions are the shared tooltips' and menu's triggers once the pointer has come near the
  // header, or its block is the list's Tab stop: plain buttons until then, as a rule row's.
  const [near, setNear] = useState(false);
  const told = useRef(false);
  const approach = () => {
    if (told.current) return;
    told.current = true;
    setNear(true);
  };
  const off = !group.enabled;
  const marks = (
    <>
      <span
        aria-hidden="true"
        className="grid size-6 flex-none place-items-center text-t40"
      >
        <Icon name={folded ? 'forward' : 'down'} size={14} />
      </span>
      <Monogram name={group.name} off={off} />
    </>
  );
  return (
    <div
      data-testid="group"
      // Where the group's right-click menu opens from the keyboard (context-menu.tsx).
      data-menu-anchor
      data-group={group.name}
      data-off={off || undefined}
      data-drop={drag.drop}
      draggable={!renaming}
      {...drag.handlers}
      onPointerEnter={approach}
      className={cn(
        'group/head group/item relative mx-1.5 flex h-[38px] items-center gap-2 rounded-md px-3 hover:bg-hover has-[[aria-haspopup=menu][data-popup-open]]:bg-hover group-data-context-open/block:bg-hover group-focus-visible/block:ring-[1.5px] group-focus-visible/block:ring-t65 group-focus-visible/block:ring-inset',
        DROP_MARK,
        INTO_MARK,
      )}
    >
      {/* The chevron over the rules' dots, the chip where their names start, the name where a
          grouped rule's starts. */}
      {renaming ? (
        <span className="-ml-[9px] flex min-w-0 flex-1 items-center gap-1">
          {marks}
          <RenameField
            name={group.name}
            label="Group name"
            testId="group-name-input"
            maxLength={100}
            tidy={groupName}
            rename={(name) => renameGroupTo(group.id, name)}
            onDone={onRenamed}
            className="ml-1 font-semibold"
          />
        </span>
      ) : (
        <Tooltip
          label={`Click to ${folded ? 'unfold' : 'fold'} it, double-click to rename it`}
        >
          <button
            type="button"
            data-testid="group-name"
            aria-expanded={!folded}
            tabIndex={-1}
            onClick={onFold}
            onDoubleClick={() => onRename(group.id)}
            className="-ml-[9px] flex min-w-0 items-center gap-1 text-left"
          >
            {marks}
            <span
              id={nameId}
              className="ml-1 truncate text-title font-semibold text-strong group-data-off/head:text-t50"
            >
              {group.name}
            </span>
          </button>
        </Tooltip>
      )}
      <ItemSlot
        shown={SHOWN}
        hidden={HIDDEN}
        actions={
          <GroupActions
            group={group}
            live={near || tabbable}
            tabbable={tabbable}
            onNear={approach}
          />
        }
      >
        <span data-testid="group-count" className="text-t40">
          {off ? 'Off' : rules.length}
        </span>
      </ItemSlot>
      {/* For a screen reader, what the slot says, in words. */}
      <span id={`${nameId}state`} hidden>
        {off ? 'Off.' : `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}.`}
      </span>
    </div>
  );
}

// The slot's actions: turn the group off or on, and its ⋯ menu. Plain buttons until the header is
// `live`: Turn works as one; a ⋯ pressed then (by a screen reader, which moves no pointer) makes it
// live and opens the menu once its trigger is there.
function GroupActions({
  group,
  live,
  tabbable,
  onNear,
}: {
  group: Group;
  live: boolean;
  tabbable: boolean;
  onNear: () => void;
}) {
  const tools = useRowTools();
  const turn = group.enabled ? 'Turn the group off' : 'Turn the group on';
  const tabIndex = tabbable ? 0 : -1;
  const menuId = `group-menu-${group.id}`;
  const menuFor = useMemo(() => ({ kind: 'group' as const, id: group.id }), [group.id]);
  const more = `More actions for ${group.name}`;
  const openOnceLive = useRef(false);
  useEffect(() => {
    if (!live || !openOnceLive.current) return;
    openOnceLive.current = false;
    tools.menu.open(menuId);
  }, [live, menuId, tools]);
  const turnButton = (
    <ItemAction
      data-testid="group-turn"
      aria-label={`Turn the group “${group.name}” ${group.enabled ? 'off' : 'on'}`}
      tabIndex={tabIndex}
      onClick={() => turnGroup(group.id, !group.enabled)}
    >
      <Icon name="power" size={14} />
    </ItemAction>
  );
  const icon = <Icon name="more" size={15} />;
  if (!live)
    return (
      <>
        {turnButton}
        <ItemAction
          data-testid="group-menu"
          aria-label={more}
          aria-haspopup="menu"
          tabIndex={tabIndex}
          onClick={() => {
            openOnceLive.current = true;
            onNear();
          }}
        >
          {icon}
        </ItemAction>
      </>
    );
  return (
    <>
      <TooltipTrigger handle={tools.turn} label={turn}>
        {turnButton}
      </TooltipTrigger>
      <TooltipTrigger handle={tools.more} label="More actions">
        <DropdownMenuTrigger
          id={menuId}
          handle={tools.menu}
          payload={menuFor}
          render={
            <ItemAction data-testid="group-menu" aria-label={more} tabIndex={tabIndex} />
          }
        >
          {icon}
        </DropdownMenuTrigger>
      </TooltipTrigger>
    </>
  );
}
