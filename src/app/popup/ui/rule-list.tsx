// The popup's rules, in your order, each with its switch, the green dot: pulsing while the rule is
// answering, still while it's on but its group or Ghostfetch is off, grey while it's off, as in
// the editor's list. Then its name, with what it did on the tab's page and when at the right
// ("2 mocked · 4m"), or under the pointer its Edit this rule, and what it matches under it
// (rule-row.tsx). A click on a rule's row opens it in the editor.
//
// Whole (All rules), it's the order as the editor's list has it: each group a row with its own dot,
// its name, and how many of its rules are on, its rules set in under it; a click on the group's row
// folds it or unfolds it, as in the editor. Split (This page), the rules that answered on the page
// come first, under "Answering here", each with its group's name, and the rest fold into one row
// that opens. A rule is where what it did on the page puts it, not where its switch does: turned
// off, it stays in its place under "Answering here", so the same spot turns it on again, until the
// page loads anew. Whole, while what each rule did on the page is known, a rule that's on but
// hasn't answered there steps back, as in the editor's list; split, the fold says so already, and
// every rule in it would step back alike.
//
// For the keyboard and a screen reader the list is a tree (ARIA's tree view), as the editor's is:
// the rules, the groups and the fold at its top level, a group's rules and the fold's a level
// under them. It's one Tab stop, the item focused last, or else the first. From there ↑ ↓ move
// between the rows (a folded group's rules, and the fold's while it's shut, are passed by), Home
// and End to the first and the last; → unfolds a group or opens the fold, or goes to its first
// rule, ← folds it, or goes from a rule to its group or the fold; Space turns a rule or a group on
// or off, as its dot does, and opens or shuts the fold; Enter opens a rule in the editor, as a
// click does, and folds a group or opens the fold. Held down, Space and Enter act once. A rule's
// item and a group's are checked while their switch is on (aria-checked), so a screen reader says
// so as Space turns it, the item staying the one with focus. Tab goes on from a rule to its Edit
// this rule, then out of the list. A right-click on a rule's row, or the ContextMenu key or
// Shift+F10 on it, opens its menu: Edit this rule, and Turn off (or on). Only opening the editor
// takes focus from the popup, which closes it: a menu's Esc shuts the menu and not the popup (Base
// UI takes the key), and a rule that moves as it answers takes focus with it rather than dropping
// it, while focus is in the list: once it's left, a redraw leaves it where it went. The Tab stop,
// the arrows and the right-click menu are one hook's, as in the editor's list and Traffic's
// (src/ui/use-roving-tree.ts).
import { useId, useState } from 'react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import {
  editRule,
  groupOf,
  ruleRevision,
  turnGroup,
} from '../../../bounded-contexts/rules/index.ts';
import type { Entry, Group, Rule } from '../../../bounded-contexts/rules/index.ts';
import { countWords } from '../../../bounded-contexts/traffic/index.ts';
import type { PageCounts } from '../../../bounded-contexts/traffic/index.ts';
import { openRuleInEditor } from '../../../platform/index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { cn } from '../../../ui/cn.ts';
import {
  foldStore,
  isFolded,
  setFolded,
} from '../../../bounded-contexts/rules/ui/group-folds.ts';
import { GroupSwitch } from '../../../bounded-contexts/rules/ui/group-switch.tsx';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../ui/kit/context-menu.tsx';
import { DropdownMenuItem } from '../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { SharedTooltip } from '../../../ui/kit/tooltip.tsx';
import { useRovingTree } from '../../../ui/use-roving-tree.ts';
import { RuleRow } from './rule-row.tsx';
import { RowToolsContext, createRowTools } from './row-tools.ts';

// The fold's item, by an id no rule or group has. The items' kinds: 'rule', 'group' and 'fold'.
const FOLD = '*not-answering';
// The ring a group's row or the fold's shows while its item has keyboard focus, as a rule's row's.
const HEAD_FOCUS =
  'group-focus-visible/head:ring-[1.5px] group-focus-visible/head:ring-t65 group-focus-visible/head:ring-inset';

// A rule turned on or off, as its dot does: saved at once.
const turnRule = (id: string) =>
  editRule(
    id,
    (current) => {
      current.enabled = !current.enabled;
    },
    { immediate: true },
  );

export function RuleList({
  rules,
  entries,
  counts,
  split,
  enabled,
  windowId,
  title,
}: {
  rules: Rule[];
  // The order's top level, for the list whole.
  entries: Entry[];
  // What each rule did on the page and when it last did, while that's known (recording, and
  // Ghostfetch on there).
  counts: PageCounts | undefined;
  split: boolean;
  enabled: boolean;
  windowId: number;
  // The list's name when it isn't split.
  title: string;
}) {
  useStore(foldStore);
  const [open, setOpen] = useState(false);
  const [tools] = useState(createRowTools);
  // The rule the right-click menu is for.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // What a rule did on the page, in words, which puts it under Answering here or in the fold,
  // whether it's on now or not: a row that left as its dot was clicked would put the next rule
  // under the pointer.
  const did = (rule: Rule) => countWords(counts?.rules[rule.id]);
  const here = split ? rules.filter((rule) => did(rule) !== '') : rules;
  const rest = split ? rules.filter((rule) => did(rule) === '') : [];
  const on = rest.filter((rule) => rule.enabled).length;
  // The items as they're drawn.
  const order = split
    ? [
        ...here.map(({ id }) => id),
        ...(rest.length ? [FOLD, ...(open ? rest.map(({ id }) => id) : [])] : []),
      ]
    : entries.flatMap((entry) =>
        entry.kind === 'rule'
          ? [entry.rule.id]
          : [
              entry.group.id,
              ...(isFolded(entry.group.id) ? [] : entry.rules.map(({ id }) => id)),
            ],
      );

  // A group folded or unfolded (as in the editor's list, which shares it), or the fold opened or
  // shut.
  function fold(id: string, shut: boolean) {
    if (id === FOLD) setOpen(!shut);
    else setFolded(id, shut);
  }

  const { ref, stop, handlers, menu, itemAt } = useRovingTree({
    ids: order,
    // The item focus was in, drawn again elsewhere (a rule that answered on the page meanwhile, up
    // out of the fold): focus follows it rather than falling out of the list, the list where it
    // was scrolled.
    follow: 'draw',
    refocus: { still: true },
    onFold: (item, shut) => fold(item.id, shut),
    onKey: (event, item) => {
      if (event.key !== 'Enter' && event.key !== ' ') return false;
      // Once, held down: each repeat would turn the rule or group again, or fold it again.
      if (event.repeat) return true;
      if (event.key === 'Enter') {
        if (item.kind === 'rule') openRuleInEditor(item.id, windowId);
        else if (item.expanded !== undefined) fold(item.id, item.expanded);
      } else if (item.kind === 'rule') turnRule(item.id);
      else if (item.kind === 'group') {
        const entry = entries.find(
          (each) => each.kind === 'group' && each.group.id === item.id,
        );
        if (entry?.kind === 'group') turnGroup(item.id, !entry.group.enabled);
      } else if (item.expanded !== undefined) fold(item.id, item.expanded);
      return true;
    },
    // A right-click on a rule's row (or the menu key on it): its menu. On a group's row, the
    // fold's, or between rows, the browser's.
    onMenu: (item) => {
      if (item.kind !== 'rule') return false;
      setMenuFor(item.id);
      return true;
    },
  });

  const row = (
    rule: Rule,
    {
      level,
      inGroup,
      position,
      count,
    }: Pick<ComponentProps<typeof RuleRow>, 'level' | 'inGroup' | 'position' | 'count'>,
  ) => {
    const group = groupOf(rule);
    return (
      <RuleRow
        key={rule.id}
        rule={rule}
        revision={ruleRevision(rule)}
        groupName={group && !inGroup ? group.name : ''}
        groupOff={group?.enabled === false ? group.name : ''}
        level={level}
        inGroup={inGroup}
        did={did(rule)}
        last={counts?.last[rule.id] ?? 0}
        stepsBack={!split && counts !== undefined}
        enabled={enabled}
        windowId={windowId}
        tabbable={rule.id === stop}
        position={position}
        count={count}
      />
    );
  };

  // A click on a rule's row opens it, as Enter does, and one on a group's row or the fold's folds
  // it; not one on a control in it (a dot, or the hidden checkbox Base UI clicks for it, or an
  // action), nor one among a group's rules that's on none of them.
  function onClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as Element;
    const item = itemAt(target);
    if (!item || target.closest('[data-slot="switch"], input, button')) return;
    if (item.kind === 'rule') openRuleInEditor(item.id, windowId);
    else if (
      item.expanded !== undefined &&
      !item.element.querySelector(':scope > [role="group"]')?.contains(target)
    )
      fold(item.id, item.expanded);
  }

  const menuRule = menuFor ? rules.find(({ id }) => id === menuFor) : undefined;
  const top = here.length + (rest.length ? 1 : 0);

  return (
    // While Ghostfetch is paused, what it would do is dimmed.
    <div
      className={cn(
        'max-h-[368px] overflow-y-auto rounded-lg bg-card p-1 scroll-thin',
        !enabled && 'opacity-55',
      )}
    >
      <h2 className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-label font-medium text-t40">
        {split ? 'Answering here' : title}
        <span className="font-normal tabular-nums">{here.length}</span>
      </h2>
      {split && !here.length && (
        <p className="px-3 pb-2 text-meta text-t40">
          No rule has answered on this page yet.
        </p>
      )}
      <RowToolsContext.Provider value={tools}>
        <ContextMenu {...menu}>
          <ContextMenuTrigger
            render={<ul ref={ref} role="tree" aria-label={split ? 'Rules' : title} />}
            {...handlers}
            onClick={onClick}
          >
            {split ? (
              <>
                {here.map((rule, index) =>
                  row(rule, {
                    level: 1,
                    inGroup: false,
                    position: index + 1,
                    count: top,
                  }),
                )}
                {rest.length > 0 && (
                  <FoldItem
                    open={open}
                    on={on}
                    off={rest.length - on}
                    tabbable={stop === FOLD}
                    position={top}
                    count={top}
                  >
                    {rest.map((rule, index) =>
                      row(rule, {
                        level: 2,
                        inGroup: false,
                        position: index + 1,
                        count: rest.length,
                      }),
                    )}
                  </FoldItem>
                )}
              </>
            ) : (
              entries.map((entry, position) =>
                entry.kind === 'rule' ? (
                  row(entry.rule, {
                    level: 1,
                    inGroup: false,
                    position: position + 1,
                    count: entries.length,
                  })
                ) : (
                  <GroupItem
                    key={entry.group.id}
                    group={entry.group}
                    rules={entry.rules}
                    folded={isFolded(entry.group.id)}
                    tabbable={stop === entry.group.id}
                    position={position + 1}
                    count={entries.length}
                  >
                    {entry.rules.map((rule, index) =>
                      row(rule, {
                        level: 2,
                        inGroup: true,
                        position: index + 1,
                        count: entry.rules.length,
                      }),
                    )}
                  </GroupItem>
                ),
              )
            )}
          </ContextMenuTrigger>
          <ContextMenuContent>
            {menuRule && (
              <>
                <DropdownMenuItem
                  data-testid="popup-menu-edit"
                  onClick={() => openRuleInEditor(menuRule.id, windowId)}
                >
                  <Icon name="edit" /> Edit this rule
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="popup-menu-turn"
                  onClick={() => turnRule(menuRule.id)}
                >
                  <Icon name="power" /> {menuRule.enabled ? 'Turn off' : 'Turn on'}
                </DropdownMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
        <SharedTooltip handle={tools.dot} />
        <SharedTooltip handle={tools.edit} />
      </RowToolsContext.Provider>
    </div>
  );
}

// A group's item in the tree, as its row: its dot (where a rule's is), its name, and how many of its
// rules are on; under it, unless it's folded, its rules. A click on the row folds it or unfolds it,
// as its chevron shows: no tooltip says so, which would say no more to a screen reader than the
// item does (its name, and expanded or not), nor open as the keys reach the item. Saved at once,
// as the popup can close at any moment.
function GroupItem({
  group,
  rules,
  folded,
  tabbable,
  position,
  count,
  children,
}: {
  group: Group;
  rules: Rule[];
  folded: boolean;
  tabbable: boolean;
  position: number;
  count: number;
  // Its rules' rows.
  children: ReactNode;
}) {
  const on = rules.filter((rule) => rule.enabled).length;
  const ids = useId();
  return (
    <li
      data-testid="popup-group-block"
      data-item={group.id}
      data-kind="group"
      role="treeitem"
      aria-level={1}
      aria-posinset={position}
      aria-setsize={count}
      aria-expanded={rules.length ? !folded : undefined}
      aria-checked={group.enabled}
      aria-labelledby={`${ids}name`}
      aria-describedby={`${ids}count`}
      tabIndex={tabbable ? 0 : -1}
      className="group/head focus-visible:outline-none"
    >
      <div
        data-testid="popup-group"
        data-group={group.name}
        className={cn(
          'flex cursor-pointer items-center gap-1 rounded-md px-3 py-[7px] hover:bg-hover',
          HEAD_FOCUS,
        )}
      >
        <GroupSwitch group={group} tabIndex={-1} className="-my-0.5 -ml-[9px]" />
        <span
          data-testid="popup-group-name"
          className={cn(
            'flex min-w-0 items-center gap-1 text-title font-semibold',
            group.enabled ? 'text-foreground' : 'text-t40',
          )}
        >
          <span id={`${ids}name`} className="truncate">
            {group.name}
          </span>
          <Icon
            name={folded ? 'forward' : 'down'}
            size={13}
            className="flex-none text-t40"
          />
        </span>
        <span
          id={`${ids}count`}
          className="ml-auto flex-none pl-2 text-label text-t40 tabular-nums"
        >
          {rules.length ? `${on} of ${rules.length} on` : 'No rules'}
        </span>
      </div>
      {!folded && rules.length > 0 && (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a tree's nested items are a group, which no element is
        <ul role="group">{children}</ul>
      )}
    </li>
  );
}

// "Not answering here", the fold the rules that haven't answered on the page go into, with how
// many of them are on and off, and under it, while it's open, their rows. A click on it opens it
// or shuts it.
function FoldItem({
  open,
  on,
  off,
  tabbable,
  position,
  count,
  children,
}: {
  open: boolean;
  on: number;
  off: number;
  tabbable: boolean;
  position: number;
  count: number;
  children: ReactNode;
}) {
  const ids = useId();
  return (
    <li
      data-testid="not-answering-block"
      data-item={FOLD}
      data-kind="fold"
      role="treeitem"
      aria-level={1}
      aria-posinset={position}
      aria-setsize={count}
      aria-expanded={open}
      aria-labelledby={`${ids}name`}
      aria-describedby={`${ids}count`}
      tabIndex={tabbable ? 0 : -1}
      className="group/head mt-1 border-t border-border pt-1 focus-visible:outline-none"
    >
      {/* On one line in any font and size, its name cut short before the count is. */}
      <div
        data-testid="not-answering"
        className={cn(
          'flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-label hover:bg-hover',
          HEAD_FOCUS,
        )}
      >
        <span id={`${ids}name`} className="min-w-0 truncate text-t65">
          Not answering here
        </span>
        <span id={`${ids}count`} className="ml-auto flex-none text-t40 tabular-nums">
          {`${on} on · ${off} off`}
        </span>
        <Icon name={open ? 'down' : 'forward'} size={13} className="flex-none text-t40" />
      </div>
      {open && (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a tree's nested items are a group, which no element is
        <ul role="group">{children}</ul>
      )}
    </li>
  );
}
