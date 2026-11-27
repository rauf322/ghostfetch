// The rules in the sidebar, in their order, under how many of them are on ("12 of 14 on"); New
// group and the + that makes a new rule are in the search row over them (RuleListButtons, which the
// sidebar draws there). A rule's place in the list is its priority (docs/adr/0001): rules are tried
// top to bottom, and the first match wins; drag one to move it, into a group or out of one, or a
// group's header to move the group with its rules. A group is a block in the list: its header,
// then its rules, set in, unless it's folded. A rule's dot turns it on or off, as its header's
// Turn the group off does the group; one that's off stays where it is, its dot grey. Search narrows
// the list, and shows every group in it open: while it does, nothing folds or unfolds one (its name
// clicked, ←, Enter or Space), for that would show only once the search was cleared.
//
// For the keyboard and a screen reader the list is a tree (ARIA's tree view; its Tab stop, keys and
// right-click menu are src/ui/use-roving-tree.ts's): the rules and the groups at its top level,
// each group's rules a level under it, a group expanded or not as it's folded. It's one Tab stop,
// the item the keyboard enters it at: the open rule's row, or else the one focused last, or else
// the first. From there ↑ ↓ move between rows and group headers (a folded group's rules aren't
// drawn, so they're passed by), Home and End to the first and the last; → on a group unfolds it,
// or goes to its first rule, ← folds it, or goes from a rule to its group; Enter and Space open a
// rule or fold a group; F2 makes a name a field to rename it. Tab goes on from an item to its own
// controls, then out of the list: other items' controls aren't Tab stops. The keys are the items'
// alone, never a field's, a control's in a row, or a menu's, and "/" and ⌘B pass through. A
// right-click on a row or a header, or the ContextMenu key or Shift+F10 on one, opens its menu: the
// same items as its ⋯, Open and Rename among them with their keys, Enter and F2. Every row's and
// header's ⋯ is one menu, and every row's dot and actions share their tooltips (row-tools.ts),
// drawn here once. A menu whose rule or group goes while it's open shuts; shut, it gives focus back
// to its item, or where that's gone (Delete), to the one in its place.
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useRovingTree } from '../../../ui/use-roving-tree.ts';
import { nameInList, renamingStore, setRenaming } from './renaming.ts';
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
  // New rule: the + (in the group New rule offers), or a group's New rule in this group (in that
  // group).
  onCreate: (group?: string) => void;
  // The editor's log of the page it watches: what each rule did there.
  log: TrafficLog;
}

export function RuleList({ selectedId, query, onSelect, onCreate, log }: RuleListProps) {
  const { entries, groups } = useStore(ruleStore);
  useStore(foldStore);
  const { id: renaming } = useStore(renamingStore);
  const [tools] = useState(createRowTools);
  // What the right-click menu is for.
  const [menuFor, setMenuFor] = useState<{ kind: 'rule' | 'group'; id: string } | null>(
    null,
  );
  // The right-click menu, and the two menus' shutting (ShutsWhenGone).
  const contextMenu = useRef<{ close: () => void; unmount: () => void } | null>(null);
  const shutContextMenu = useCallback(() => contextMenu.current?.close(), []);
  const shutRowMenu = useCallback(() => tools.menu.close(), [tools]);
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
  // The items as they're drawn: a rule's row (its kind 'rule') or a group's block ('group').
  const order = visible.flatMap((entry) =>
    entry.kind === 'rule'
      ? [entry.rule.id]
      : [
          entry.group.id,
          ...(foldedNow(entry.group.id) ? [] : entry.rules.map(({ id }) => id)),
        ],
  );
  const { ref, stop, handlers, menu, itemMenu, focusItem } = useRovingTree({
    ids: order,
    open: selectedId,
    back: 'or next',
    // A search shows every group open, and while it does no key folds one, unseen, for later.
    onFold: (item, shut) => {
      if (!shut || !searching) setFolded(item.id, shut);
    },
    onKey: (event, item) => {
      switch (event.key) {
        case 'Enter':
        case ' ':
          if (item.kind !== 'group') onSelect(item.id);
          else if (!searching) setFolded(item.id, !isFolded(item.id));
          return true;
        case 'F2':
          setRenaming(item.id);
          return true;
        default:
          return false;
      }
    },
    onMenu: (item) => {
      setMenuFor({ kind: item.kind === 'group' ? 'group' : 'rule', id: item.id });
      return true;
    },
  });

  // A rule opened in a folded group (from Traffic, the popup, or just made in it) unfolds it, and
  // so does the open rule moved into one (its ⋯ menu's Move to group, or a drag), so the rule
  // stays in sight, picked: on opening a rule, and on the open rule going to another group.
  // Folding the open rule's group by hand leaves it folded.
  const selectedGroup = findRule(selectedId)?.group ?? '';
  useEffect(() => {
    if (selectedId && selectedGroup && isFolded(selectedGroup))
      setFolded(selectedGroup, false);
  }, [selectedId, selectedGroup]);

  // A name renamed by Enter or Esc gives focus back to its item, or to the list where the name
  // doesn't match the search any more.
  const renamed = useCallback(
    (id: string, byKey: boolean) => {
      setRenaming(null);
      if (byKey) requestAnimationFrame(() => focusItem(id));
    },
    [focusItem],
  );

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
          <div className="flex h-9 items-center pt-2 pr-2 pl-[22px]">
            <h2 className="text-label font-medium text-t40 tabular-nums">
              {shown.length ? `${on} of ${shown.length} on` : 'Rules'}
            </h2>
          </div>
          <RowToolsContext.Provider value={tools}>
            <ContextMenu actionsRef={contextMenu} {...menu}>
              <ContextMenuTrigger
                render={<ul ref={ref} data-entries role="tree" aria-label="Rules" />}
                {...handlers}
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
                      // Its tooltip's words stay as a search starts: words that change put new
                      // hidden copies in the page (tooltip.tsx), which in Chromium splits what's
                      // typed in the search into more steps of the browser's own undo.
                      onFold={() => {
                        if (!searching)
                          setFolded(entry.group.id, !isFolded(entry.group.id));
                      }}
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
                    onRename={() => setRenaming(menuRule.id)}
                  />
                )}
                {menuGroup && (
                  <GroupMenuItems
                    group={menuGroup}
                    onRename={setRenaming}
                    onNewRule={onCreate}
                  />
                )}
                {!menuRule && !menuGroup && <ShutsWhenGone shut={shutContextMenu} />}
              </ContextMenuContent>
            </ContextMenu>
            {/* The rows' and headers' one ⋯ menu, for the rule or group whose ⋯ opened it. */}
            <DropdownMenu handle={tools.menu} {...itemMenu}>
              {({ payload }) => {
                const rule = payload?.kind === 'rule' ? findRule(payload.id) : undefined;
                const group =
                  payload?.kind === 'group'
                    ? groups.find(({ id }) => id === payload.id)
                    : undefined;
                return (
                  <DropdownMenuContent>
                    {rule ? (
                      <RuleMenuItems
                        rule={rule}
                        open={rule.id === selectedId}
                        onSelect={onSelect}
                        onRename={() => setRenaming(rule.id)}
                      />
                    ) : group ? (
                      <GroupMenuItems
                        group={group}
                        onRename={setRenaming}
                        onNewRule={onCreate}
                      />
                    ) : (
                      <ShutsWhenGone shut={shutRowMenu} />
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

// Shuts the menu it's drawn in, where what the menu was opened for has gone meanwhile (deleted by
// the agent, or in another window), rather than leaving it open with nothing in it.
function ShutsWhenGone({ shut }: { shut: () => void }) {
  useEffect(shut, [shut]);
  return null;
}

// New group and New rule, which the sidebar puts in its search row, over the list: a new group at
// the top, its name a field in sight (a search that would hide it cleared), and New rule, in the
// group New rule offers.
export function RuleListButtons({ onCreate }: { onCreate: () => void }) {
  return (
    <>
      <Tooltip label="New group">
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="new-group"
          aria-label="New group"
          onClick={() =>
            nameInList(
              addGroup(createGroup(freeName(NEW_GROUP, ruleStore.state.groups)), 0).id,
            )
          }
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
    </>
  );
}
