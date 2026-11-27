// A rule's ⋯ menu: open it, rename it, duplicate it, move it to a group or out of one (its group
// beside the item), export it, or delete it (with Undo, which puts it back where it was, in its
// group: in the sidebar's footer, with ⌘Z, or where that isn't on screen in a toast,
// undo-delete.ts). Three menus are one list of items (RuleMenuItems), so they can't drift apart:
// the open rule's, in its header (RuleMenu), and its row's two in the list, under the ⋯ in the
// row's slot (rule-list-item.tsx) and on a right-click, both drawn in rule-list.tsx. The open
// rule's is one menu for two controls, as the list's rows share theirs (row-tools.ts): its ⋯
// (RuleMenuButton) at the header's right end, and its name, a crumb at the header's left
// (rule-crumbs.tsx), each opening it under itself.
//
// Open and Rename show their keys, Enter and F2, which do the same on the rule's row in the list
// (and F2 on the name's crumb); there's no Open where the rule is the open one. Rename renames
// where the menu is: in the row, or in the open rule's name's crumb (rule-header.tsx).
import { useRef } from 'react';
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
  DropdownMenuDetail,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../../../ui/kit/dropdown-menu.tsx';
import type { MenuHandle } from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import { exportRule } from '../rules-file.tsx';
import { offerUndo } from '../undo-delete.ts';
import { nameInList } from '../renaming.ts';

// No group, as the radio group's value: not an id a group can have.
const NONE = '*none';

// Which of the open rule's two controls opened its menu: the ⋯, or its name's crumb.
export type RuleMenuFrom = 'more' | 'name';

// The open rule's menu, drawn once for both: under the ⋯, right edges lined up; under the crumb,
// left edges. Its Rename (`onRename`, the header's) waits for the menu to have shut and given its
// button the focus back: a field made at once would lose the focus to that, and shut, or take the
// crumb's place with the menu still on it, as the group's crumb says (rule-crumbs.tsx).
export function RuleMenu({
  handle,
  rule,
  onSelect,
  onRename,
}: {
  handle: MenuHandle<RuleMenuFrom>;
  rule: Rule;
  onSelect: (id: string | null) => void;
  onRename: () => void;
}) {
  const renameNext = useRef(false);
  return (
    <DropdownMenu
      handle={handle}
      onOpenChangeComplete={(open) => {
        if (open || !renameNext.current) return;
        renameNext.current = false;
        // A frame on: the menu, shut, is gone from the page by then.
        requestAnimationFrame(onRename);
      }}
    >
      {({ payload }) => (
        <DropdownMenuContent align={payload === 'name' ? 'start' : 'end'}>
          <RuleMenuItems
            rule={rule}
            open
            onSelect={onSelect}
            onRename={() => {
              renameNext.current = true;
            }}
          />
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

// The menu's items, in a DropdownMenuContent. Open opens the rule, where it isn't the open one
// (`open`); Rename makes its name a field where the menu is (`onRename`); Duplicate opens the copy;
// Delete closes the rule if it's the open one, and Undo opens it again, while a rule deleted from
// its row with another one open leaves that one open.
export function RuleMenuItems({
  rule,
  open,
  onSelect,
  onRename,
}: {
  rule: Rule;
  open: boolean;
  onSelect: (id: string | null) => void;
  onRename: () => void;
}) {
  const { groups } = useStore(ruleStore);
  const inGroup = placeOf(rule.id)?.group ?? '';
  const itsGroup = groups.find(({ id }) => id === inGroup);

  function remove() {
    const removed = removeRule(rule.id);
    if (!removed) return;
    offerUndo({
      said: 'Rule deleted',
      toast: `Deleted “${ruleTitle(rule)}”`,
      item: removed.rule.id,
      undo: () => {
        addRule(removed.rule, removed.place);
        if (open) onSelect(removed.rule.id);
      },
    });
    if (open) onSelect(null);
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

  // A new group at the top of the list with the rule in it, its name ready to type there, in sight
  // (the open rule's menu can be opened with the list hidden, or searched).
  function moveToNew() {
    const group = addGroup(createGroup(freeName(NEW_GROUP, ruleStore.state.groups)), 0);
    moveRule(rule.id, { group: group.id, index: 0 });
    nameInList(group.id);
  }

  return (
    <>
      {!open && (
        <DropdownMenuItem
          data-testid="menu-open-rule"
          aria-keyshortcuts="Enter"
          onClick={() => onSelect(rule.id)}
        >
          <Icon name="arrow" /> Open <DropdownMenuShortcut>↵</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        data-testid="rename-rule"
        aria-keyshortcuts="F2"
        onClick={onRename}
      >
        <Icon name="edit" /> Rename <DropdownMenuShortcut>F2</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onSelect(duplicateRule(rule))}>
        <Icon name="copy" /> Duplicate
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid="move-to-group">
          <Icon name="group" /> Move to group
          {itsGroup && (
            <>
              {' '}
              <DropdownMenuDetail data-testid="move-to-group-detail">
                {itsGroup.name}
              </DropdownMenuDetail>
            </>
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={inGroup || NONE}
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
