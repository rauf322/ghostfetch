// Where the open rule is, at the left of its header in a wide editor (from 760 px; a narrow panel
// has its back button there instead), as controls, after T3 Code's breadcrumb (ChatHeader.tsx):
// the rule's group, or "Rules" for a rule in none, then the rule's name.
//
// - The group's crumb: the group's dot and its name, as the list draws a group (SignalDot: green
//   while the group is on, still while Ghostfetch is off, grey while the group is off), or
//   "Rules". Under the pointer, with focus, or while its menu is open, the "/" after it is a
//   chevron, in the same place, so nothing moves. Its menu: New rule in this group (as the
//   group's + in the list), then the group's own items (GroupMenuItems, group-menu.tsx); for
//   "Rules", New rule, in no group. Rename makes the group's name a field here, as the name's crumb
//   does (and a name another group has is turned down, the field staying for another); Duplicate
//   names the copy in the list, which shows for it if ⌘B hid it (renaming.ts).
// - The rule's name: its menu, the ⋯'s (one menu for both, rule-menu.tsx), with a chevron after it
//   under the pointer, with focus, or while that's open. A double-click, or F2 while it has focus,
//   makes it a field to rename the rule in place (rename-field.tsx, as F2 does in its row): Enter
//   or leaving it gives the name typed (none, too: the URL names the rule then), Esc keeps the one
//   it had, and after either key focus is back on the crumb. The first click of a double-click
//   opens the menu and the second shuts it, as in T3 Code.
import { useRef, useState } from 'react';
import { editRule, groupName, pausedStore, ruleTitle } from '../../index.ts';
import type { Group, Rule } from '../../index.ts';
import { useStore } from '../../../../ui/use-store.ts';
import { cn } from '../../../../ui/cn.ts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../ui/kit/dropdown-menu.tsx';
import type { MenuHandle } from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { SignalDot } from '../../../../ui/kit/signal-dot.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import { GroupMenuItems } from '../group-menu.tsx';
import { RenameField } from '../rename-field.tsx';
import { renameGroupTo } from '../renaming.ts';
import type { RuleMenuFrom } from './rule-menu.tsx';

const CRUMB =
  'inline-flex h-7 min-w-0 items-center rounded-md text-control outline-offset-[-2px] hover:bg-hover data-popup-open:bg-hover';
// What shows a crumb's chevron while the crumb is in use (under the pointer, with focus, its menu
// open), by the Tailwind group the crumb is marked with: group/crumb on the group's crumb,
// group/name on the name's.
const SHOWS = {
  crumb:
    'group-hover/crumb:opacity-100 group-focus-visible/crumb:opacity-100 group-data-popup-open/crumb:opacity-100',
  name: 'group-hover/name:opacity-100 group-focus-visible/name:opacity-100 group-data-popup-open/name:opacity-100',
};

export function RuleCrumbs({
  rule,
  group,
  menu,
  onNewRule,
}: {
  rule: Rule;
  group: Group | undefined;
  // The rule's menu, which its ⋯ opens too.
  menu: MenuHandle<RuleMenuFrom>;
  // New rule, in a group ('' for none).
  onNewRule: (group: string) => void;
}) {
  return (
    <nav
      aria-label="Where the rule is"
      data-testid="rules-head-path"
      className="hidden min-w-0 flex-1 items-center wide:flex"
    >
      <GroupCrumb group={group} onNewRule={onNewRule} />
      <NameCrumb rule={rule} menu={menu} />
    </nav>
  );
}

function GroupCrumb({
  group,
  onNewRule,
}: {
  group: Group | undefined;
  onNewRule: (group: string) => void;
}) {
  const { paused } = useStore(pausedStore);
  const [renaming, setRenamingHere] = useState(false);
  // Rename picked in its menu: the name a field once the menu's shut and has given the crumb its
  // focus back. Made at once, the field would take the crumb's place, menu and all, and the menu,
  // its button gone, would give the focus to whatever had it before (the Rules tab, say), taking
  // it from the field, which would shut.
  const renameNext = useRef(false);
  const crumb = useRef<HTMLButtonElement>(null);
  if (group && renaming)
    return (
      <span className="flex max-w-[45%] min-w-0 flex-[0_1_auto] items-center gap-1.5 pl-1.5">
        <SignalDot on={group.enabled} paused={paused} />
        <RenameField
          name={group.name}
          label="Group name"
          testId="crumb-group-input"
          maxLength={100}
          tidy={groupName}
          rename={(name) => renameGroupTo(group.id, name)}
          onDone={(byKey) => {
            setRenamingHere(false);
            if (byKey) requestAnimationFrame(() => crumb.current?.focus());
          }}
          className="h-7 text-control"
        />
        <span aria-hidden="true" className="w-3.5 flex-none text-center text-t30">
          /
        </span>
      </span>
    );
  return (
    <DropdownMenu
      onOpenChangeComplete={(open) => {
        if (open || !renameNext.current) return;
        renameNext.current = false;
        // A frame on: the menu, shut, is gone from the page by then.
        requestAnimationFrame(() => setRenamingHere(true));
      }}
    >
      <Tooltip label={group ? 'Group actions' : 'New rule'}>
        <DropdownMenuTrigger
          render={
            <button
              ref={crumb}
              type="button"
              data-testid="crumb-group"
              aria-label={group ? `Group “${group.name}”` : 'Rules'}
              className={cn(
                CRUMB,
                'group/crumb max-w-[45%] flex-[0_1_auto] gap-1.5 pr-0.5 pl-1.5 text-t50 hover:text-foreground data-popup-open:text-foreground',
              )}
            />
          }
        >
          {group && <SignalDot on={group.enabled} paused={paused} />}
          <span className="min-w-0 truncate">{group ? group.name : 'Rules'}</span>
          <span
            aria-hidden="true"
            className="relative grid w-3.5 flex-none place-items-center"
          >
            <span
              className={cn(
                'text-t30 transition-opacity duration-100',
                'group-hover/crumb:opacity-0 group-focus-visible/crumb:opacity-0 group-data-popup-open/crumb:opacity-0',
              )}
            >
              {' / '}
            </span>
            <Icon
              name="down"
              size={12}
              className={cn(
                'absolute text-t50 opacity-0 transition-opacity duration-100',
                SHOWS.crumb,
              )}
            />
          </span>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          data-testid="crumb-new-rule"
          onClick={() => onNewRule(group?.id ?? '')}
        >
          <Icon name="plus" /> {group ? 'New rule in this group' : 'New rule'}
        </DropdownMenuItem>
        {group && (
          <>
            <DropdownMenuSeparator />
            <GroupMenuItems
              group={group}
              onRename={() => {
                renameNext.current = true;
              }}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NameCrumb({ rule, menu }: { rule: Rule; menu: MenuHandle<RuleMenuFrom> }) {
  const [renaming, setRenamingHere] = useState(false);
  const crumb = useRef<HTMLButtonElement>(null);
  const title = ruleTitle(rule);
  function rename() {
    menu.close();
    setRenamingHere(true);
  }
  if (renaming)
    return (
      <RenameField
        name={rule.name}
        label="Rule name"
        testId="crumb-name-input"
        allowEmpty
        rename={(name) => {
          editRule(rule.id, (current) => {
            current.name = name;
          });
          return true;
        }}
        onDone={(byKey) => {
          setRenamingHere(false);
          if (byKey) requestAnimationFrame(() => crumb.current?.focus());
        }}
        className="h-7 text-control font-medium"
      />
    );
  return (
    <Tooltip label="Rule actions. Double-click to rename it" keys="F2">
      <DropdownMenuTrigger
        handle={menu}
        payload="name"
        render={
          <button
            ref={crumb}
            type="button"
            data-testid="crumb-name"
            aria-label={`Rule “${title}”`}
            onDoubleClick={(event) => {
              if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey)
                rename();
            }}
            onKeyDown={(event) => {
              if (
                event.key !== 'F2' ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey
              )
                return;
              event.preventDefault();
              rename();
            }}
            className={cn(
              CRUMB,
              'group/name flex-[0_1_auto] gap-1 px-1.5 text-t80 hover:text-strong data-popup-open:text-strong',
            )}
          />
        }
      >
        <span className="min-w-0 truncate">{title}</span>
        <Icon
          name="down"
          size={12}
          className={cn('text-t50 opacity-0 transition-opacity duration-100', SHOWS.name)}
        />
      </DropdownMenuTrigger>
    </Tooltip>
  );
}
