// The rules in the sidebar, in their order, under how many of them are on ("12 of 14 on"), New
// group, and the + that makes a new rule. A rule's place in the list is its priority
// (docs/adr/0001): rules are tried top to bottom, and the first match wins; drag one to move it,
// into a group or out of one, or a group's header to move the group with its rules. A group is a
// block in the list: its header, then its rules, set in, unless it's folded. A rule's dot turns it
// on or off, as a group's does the group; one that's off stays where it is, its dot grey. Search
// narrows the list.
//
// For the keyboard and a screen reader the list is a tree (ARIA's tree view): the rules and the
// groups at its top level, each group's rules a level under it, a group expanded or not as it's
// folded. It's one Tab stop, the item the keyboard enters it at: the open rule's row, or else the
// one focused last, or else the first. From there ↑ ↓ move between rows and group headers (a folded
// group's rules aren't drawn, so they're passed by), Home and End to the first and the last; → on a
// group unfolds it, or goes to its first rule, ← folds it, or goes from a rule to its group; Enter
// and Space open a rule or fold a group; F2 makes a name a field to rename it. Tab goes on from an
// item to its own controls, then out of the list: other items' controls aren't Tab stops. The keys
// are the items' alone, never a field's, a control's in a row, or a menu's, and "/" and ⌘B pass
// through. A right-click on a row or a header, or the ContextMenu key or Shift+F10 on one, opens
// its menu: the same items as its ⋯. Every row's ⋯ is one menu, and every row's dot and actions
// share their tooltips (row-tools.ts), drawn here once.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import {
  NEW_GROUP,
  addGroup,
  createGroup,
  findRule,
  freeName,
  ruleRevision,
  ruleStore,
} from '../index.ts';
import { filterEntries } from '../domain/filter-rules.ts';
import type { TrafficLog } from '../../traffic/index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { foldStore, isFolded, setFolded } from './group-folds.ts';
import { Button } from '../../../ui/kit/button.tsx';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../ui/kit/context-menu.tsx';
import { DropdownMenu, DropdownMenuContent } from '../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { SharedTooltip, Tooltip } from '../../../ui/kit/tooltip.tsx';
import { ListEmpty } from '../../../ui/list-detail.tsx';
import { renamingStore, setRenaming } from './renaming.ts';
import { useRuleDrag } from './use-rule-drag.ts';
import { GroupBlock } from './group-block.tsx';
import { GroupMenuItems } from './group-menu.tsx';
import { NoRulesYet } from './no-rules.tsx';
import { RuleListItem } from './rule-list-item.tsx';
import { RuleMenuItems } from './rule-editor/rule-menu.tsx';
import { RowToolsContext, createRowTools } from './row-tools.ts';

interface RuleListProps {
  selectedId: string | null;
  query: string;
  // A rule picked: open it; null: close the open one (deleted from its row's ⋯ menu).
  onSelect: (id: string | null) => void;
  // New rule: the + (in the group New rule offers), or a group's + (in that group).
  onCreate: (group?: string) => void;
  // The editor's log of the page it watches: what each rule did there.
  log: TrafficLog;
}

const ITEM = '[role="treeitem"]';

// What a menu was opened from: an item, and where it was among the items, while it or a control
// in it had focus (else null).
interface MenuFrom {
  id: string;
  index: number;
}

export function RuleList({ selectedId, query, onSelect, onCreate, log }: RuleListProps) {
  const { entries, groups } = useStore(ruleStore);
  useStore(foldStore);
  const { id: renaming } = useStore(renamingStore);
  const [tools] = useState(createRowTools);
  const tree = useRef<HTMLUListElement>(null);
  // The item focus is in now (null while it's outside the list), and the one it was in last.
  const [focused, setFocused] = useState<string | null>(null);
  const [lastFocused, setLastFocused] = useState<string | null>(null);
  // What the right-click menu is for, and the item it's marked open on.
  const [menuFor, setMenuFor] = useState<{ kind: 'rule' | 'group'; id: string } | null>(
    null,
  );
  const marked = useRef<HTMLElement | null>(null);
  const menuFrom = useRef<MenuFrom | null>(null);
  const searching = Boolean(query.trim());
  const visible = filterEntries(entries, query);
  const drag = useRuleDrag(visible.at(-1));
  const shown = visible.flatMap((entry) =>
    entry.kind === 'rule' ? [entry.rule] : entry.rules,
  );
  const none = Boolean(entries.length) && !visible.length;
  const on = shown.filter((rule) => rule.enabled).length;
  // Each group's rules, whatever the search shows of them: what its header counts.
  const all = new Map(
    entries.flatMap((entry) =>
      entry.kind === 'group' ? [[entry.group.id, entry.rules] as const] : [],
    ),
  );
  // A search shows what it found, folded or not.
  const foldedNow = (id: string) => !searching && isFolded(id);
  // The items as they're drawn, and the one that's the list's Tab stop.
  const order = visible.flatMap((entry) =>
    entry.kind === 'rule'
      ? [entry.rule.id]
      : [
          entry.group.id,
          ...(foldedNow(entry.group.id) ? [] : entry.rules.map(({ id }) => id)),
        ],
  );
  const stop =
    [focused, selectedId, lastFocused].find((id) => id !== null && order.includes(id)) ??
    order[0] ??
    null;

  // A rule opened in a folded group (from Traffic, the popup, or just made in it) unfolds it, and
  // so does the open rule moved into one (its ⋯ menu's Move to group, or a drag), so the rule
  // stays in sight, picked: on opening a rule, and on the open rule going to another group.
  // Folding the open rule's group by hand leaves it folded.
  const selectedGroup = findRule(selectedId)?.group ?? '';
  useEffect(() => {
    if (selectedId && selectedGroup && isFolded(selectedGroup))
      setFolded(selectedGroup, false);
  }, [selectedId, selectedGroup]);

  function newGroup() {
    const group = addGroup(createGroup(freeName(NEW_GROUP, ruleStore.state.groups)), 0);
    setRenaming(group.id);
  }

  const items = () => [...(tree.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
  const focusItem = useCallback((id: string) => {
    tree.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`)?.focus();
  }, []);

  // A name renamed by Enter or Esc gives focus back to its item.
  const renamed = useCallback(
    (id: string, byKey: boolean) => {
      setRenaming(null);
      if (byKey) requestAnimationFrame(() => focusItem(id));
    },
    [focusItem],
  );

  // A menu opened from an item with focus in it: once the menu's shut, focus goes back to the
  // item, which Base UI can't do when the item's gone (Delete) or drawn again elsewhere (Move to
  // group): the item, or the one in its place. Not where focus went on, to a field or the editor.
  function noteMenuFrom(element: Element | null | undefined) {
    const item = element?.closest<HTMLElement>(ITEM);
    const active = document.activeElement;
    menuFrom.current =
      item?.dataset.item && active && item.contains(active)
        ? { id: item.dataset.item, index: items().indexOf(item) }
        : null;
  }
  function backToList() {
    const from = menuFrom.current;
    menuFrom.current = null;
    if (!from || (document.activeElement && document.activeElement !== document.body))
      return;
    const now = items();
    (
      now.find((item) => item.dataset.item === from.id) ??
      now[Math.min(from.index, now.length - 1)]
    )?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const item = event.target as HTMLElement;
    if (
      !item.matches(ITEM) ||
      !event.currentTarget.contains(item) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const id = item.dataset.item ?? '';
    const group = item.dataset.testid === 'group-block';
    const expanded = item.getAttribute('aria-expanded');
    const now = items();
    const index = now.indexOf(item);
    let to: HTMLElement | null | undefined;
    switch (event.key) {
      case 'ArrowDown':
        to = now[index + 1];
        break;
      case 'ArrowUp':
        to = now[index - 1];
        break;
      case 'Home':
        to = now[0];
        break;
      case 'End':
        to = now.at(-1);
        break;
      case 'ArrowRight':
        if (expanded === 'false') setFolded(id, false);
        else if (expanded === 'true')
          to = item.querySelector<HTMLElement>(`:scope > [role="group"] > ${ITEM}`);
        break;
      case 'ArrowLeft':
        if (expanded === 'true') setFolded(id, true);
        else if (!group) to = item.parentElement?.closest<HTMLElement>(ITEM);
        break;
      case 'Enter':
      case ' ':
        if (group) setFolded(id, !isFolded(id));
        else onSelect(id);
        break;
      case 'F2':
        setRenaming(id);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (!to) return;
    to.focus();
    to.scrollIntoView({ block: 'nearest' });
  }

  function onFocus(event: FocusEvent<HTMLElement>) {
    const item = (event.target as Element).closest<HTMLElement>(ITEM);
    if (item && event.currentTarget.contains(item)) setFocused(item.dataset.item ?? null);
  }

  function onBlur(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (focused) setLastFocused(focused);
    setFocused(null);
  }

  // A right-click on an item (or the menu key on it): its menu, the item marked as having it open.
  // Elsewhere in the list (between items), the browser's.
  function onContextMenu(
    event: MouseEvent<HTMLElement> & { preventBaseUIHandler: () => void },
  ) {
    const item = (event.target as Element).closest<HTMLElement>(ITEM);
    if (!item?.dataset.item) {
      event.preventBaseUIHandler();
      event.stopPropagation();
      return;
    }
    marked.current?.removeAttribute('data-context-open');
    item.setAttribute('data-context-open', '');
    marked.current = item;
    noteMenuFrom(item);
    setMenuFor({
      kind: item.dataset.testid === 'group-block' ? 'group' : 'rule',
      id: item.dataset.item,
    });
  }

  const menuRule = menuFor?.kind === 'rule' ? findRule(menuFor.id) : undefined;
  const menuGroup =
    menuFor?.kind === 'group' ? groups.find(({ id }) => id === menuFor.id) : undefined;

  return (
    // A container: a group's header shows how many of its rules are on where there's room. A
    // rule or group dragged under the last entry goes to the end of the list (use-rule-drag.ts),
    // so there's always a little room under it, however long the list.
    <div
      data-testid="rule-list"
      className="@container/rules min-h-0 flex-1 overflow-auto py-1 scroll-thin"
      {...drag.list()}
    >
      {none ? (
        <ListEmpty>
          <p>{`No rules match “${query}”.`}</p>
        </ListEmpty>
      ) : (
        <section className="pb-3">
          {/* The label starts over the rules' dots. */}
          <div className="flex h-9 items-center justify-between pt-2 pr-2 pl-[22px]">
            <h2 className="text-label font-medium text-t40 tabular-nums">
              {shown.length ? `${on} of ${shown.length} on` : 'Rules'}
            </h2>
            <div className="-my-1 -mr-1.5 flex items-center">
              <Tooltip label="New group">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid="new-group"
                  aria-label="New group"
                  onClick={newGroup}
                >
                  <Icon name="newgroup" size={15} />
                </Button>
              </Tooltip>
              <Tooltip label="New rule">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid="new-rule"
                  aria-label="New rule"
                  onClick={() => onCreate()}
                >
                  <Icon name="plus" size={15} />
                </Button>
              </Tooltip>
            </div>
          </div>
          <RowToolsContext.Provider value={tools}>
            <ContextMenu
              onOpenChange={(open) => {
                if (open) return;
                marked.current?.removeAttribute('data-context-open');
                marked.current = null;
              }}
              onOpenChangeComplete={(open) => {
                if (!open) requestAnimationFrame(backToList);
              }}
            >
              <ContextMenuTrigger
                render={<ul ref={tree} data-entries role="tree" aria-label="Rules" />}
                onContextMenu={onContextMenu}
                onKeyDown={onKeyDown}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                {visible.map((entry, position) =>
                  entry.kind === 'rule' ? (
                    <RuleListItem
                      key={entry.rule.id}
                      rule={entry.rule}
                      revision={ruleRevision(entry.rule)}
                      selected={entry.rule.id === selectedId}
                      drag={drag.rule(entry.rule)}
                      inGroup={false}
                      groupOff=""
                      log={log}
                      tabbable={entry.rule.id === stop}
                      renaming={renaming === entry.rule.id}
                      position={position + 1}
                      count={visible.length}
                      onSelect={onSelect}
                      onRenamed={renamed}
                    />
                  ) : (
                    <GroupBlock
                      key={entry.group.id}
                      entry={entry}
                      all={all.get(entry.group.id) ?? entry.rules}
                      folded={foldedNow(entry.group.id)}
                      renaming={renaming}
                      stop={stop}
                      position={position + 1}
                      count={visible.length}
                      selectedId={selectedId}
                      drag={drag}
                      log={log}
                      onSelect={onSelect}
                      onCreate={onCreate}
                      onFold={() => setFolded(entry.group.id, !isFolded(entry.group.id))}
                      onRename={setRenaming}
                      onRenamed={renamed}
                    />
                  ),
                )}
              </ContextMenuTrigger>
              <ContextMenuContent>
                {menuRule && (
                  <RuleMenuItems
                    rule={menuRule}
                    open={menuRule.id === selectedId}
                    onSelect={onSelect}
                  />
                )}
                {menuGroup && <GroupMenuItems group={menuGroup} onRename={setRenaming} />}
              </ContextMenuContent>
            </ContextMenu>
            {/* The rows' one ⋯ menu, for the rule whose ⋯ opened it. */}
            <DropdownMenu
              handle={tools.menu}
              onOpenChange={(open, details) => {
                if (open) noteMenuFrom(details.trigger);
              }}
              onOpenChangeComplete={(open) => {
                if (!open) requestAnimationFrame(backToList);
              }}
            >
              {({ payload }) => {
                const rule = payload ? findRule(payload) : undefined;
                return (
                  <DropdownMenuContent>
                    {rule && (
                      <RuleMenuItems
                        rule={rule}
                        open={rule.id === selectedId}
                        onSelect={onSelect}
                      />
                    )}
                  </DropdownMenuContent>
                );
              }}
            </DropdownMenu>
            <SharedTooltip handle={tools.dot} />
            <SharedTooltip handle={tools.turn} />
            <SharedTooltip handle={tools.more} />
          </RowToolsContext.Provider>
        </section>
      )}
      {!entries.length && <NoRulesYet />}
    </div>
  );
}
