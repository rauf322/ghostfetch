// The Traffic view's list, after a bank statement: the filters, a notice when nothing is coming
// in, then the requests, newest first, in a card for each stretch of time ("Just now", "A few
// minutes ago").
//
// For the keyboard and a screen reader it's a list of buttons, a request's row each
// (request-row.tsx), which opens the request. The list is one Tab stop: the row focus is in, or
// else the open request's, or else the one focused last, or else the newest. From there ↑ ↓ move
// between the requests, from one stretch of time to the next, Home and End to the newest and the
// oldest, and Enter or Space opens one; Tab goes on from a row to its actions, then out of the
// list, as other rows' actions aren't Tab stops. The keys are the rows' alone: the filters and the
// search keep theirs. A right-click on a row, or the ContextMenu key or Shift+F10 on it, opens its
// menu: its actions (each the row's own, so a copy says so in the row, as the slot shows its
// actions for that second), and Open the rule where a rule answered it. Every row's actions share
// their tooltips (row-tools.ts), drawn here once. The Tab stop, the keys and the menu are the hook
// the rule lists have too (src/ui/use-roving-tree.ts).
import { useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Rule } from '../../rules/index.ts';
import { siteStore } from '../../sites/index.ts';
import type { LogEntry, TrafficSnapshot } from '../index.ts';
import { cn } from '../../../ui/cn.ts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../ui/kit/context-menu.tsx';
import { DropdownMenuItem } from '../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { ItemList } from '../../../ui/kit/item.tsx';
import { SharedTooltip } from '../../../ui/kit/tooltip.tsx';
import { PaneSection } from '../../../ui/list-detail.tsx';
import { useNow } from '../../../ui/use-now.ts';
import { findItem, useRovingTree } from '../../../ui/use-roving-tree.ts';
import { countEntries, filterEntries } from '../domain/filter-entries.ts';
import type { TrafficFilter } from '../domain/filter-entries.ts';
import { groupByTime } from '../domain/time-groups.ts';
import { OPEN_RULE, ROW_ACTIONS, mockEntry } from './entry-actions.ts';
import { RequestRow } from './request-row.tsx';
import { RowToolsContext, createRowTips } from './row-tools.ts';
import { TrafficFilters } from './traffic-filters.tsx';
import { TrafficNotice } from './traffic-notice.tsx';

interface TrafficListProps {
  traffic: TrafficSnapshot;
  // Recording: whether requests are being captured.
  record: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMock: (draft: Rule, entry: LogEntry) => void;
  onOpenRule: (id: string) => void;
  className?: string;
}

// What's in the list is a column at most this wide, in the middle of a wide window.
const COLUMN = 'mx-auto w-full max-w-[880px] px-3';
// A row's button, the one that opens its request, which takes the row's focus: the keys move
// between them.
const OPEN = '[data-row-open]';

// A request's row's button, as the list in `within` draws it now.
export const requestButton = (within: ParentNode | null | undefined, id: string) =>
  findItem(within, id)?.querySelector<HTMLElement>(OPEN) ?? null;

export function TrafficList({
  traffic,
  record,
  selectedId,
  onSelect,
  onMock,
  onOpenRule,
  className,
}: TrafficListProps) {
  // Only the one setting the list shows, so it doesn't draw again for the others.
  const sites = useSyncExternalStore(siteStore.subscribe, () => siteStore.state.sites);
  const [filter, setFilter] = useState<TrafficFilter>('all');
  const [search, setSearch] = useState('');
  const now = useNow();
  const { entries } = traffic;
  const groups = groupByTime(filterEntries(entries, filter, search), now);
  const shown = groups.flatMap((group) => group.entries);
  // The rows' tooltips, made once, and Mock this response, made again only when the editor's
  // onMock changes (the group a new rule goes into was picked), which draws the rows' actions
  // again, not the rows.
  const [tips] = useState(createRowTips);
  const tools = useMemo(
    () => ({ tips, mock: (entry: LogEntry) => mockEntry(entry, onMock) }),
    [tips, onMock],
  );
  // The request the right-click menu is for.
  const [menuFor, setMenuFor] = useState<LogEntry | null>(null);
  // Each row an item of the kind 'request', which its button takes the focus for.
  const { ref, stop, handlers, menu, menuOpen, itemById } = useRovingTree({
    ids: shown.map(({ id }) => id),
    open: selectedId,
    focusIn: OPEN,
    // Shut, the menu gives focus back to the row it came from (kit/context-menu.tsx), which Base
    // UI can't do where a tick has drawn the row again under another time: the row as it's drawn
    // now, with its ring as it was.
    back: 'item',
    refocus: { ring: true },
    // A request a tick moves under another time is drawn again in that time's list, and focus, in
    // its row, falls to the page as the old row goes: it comes back to the row once the list is
    // drawn, before it's painted. The open menu's mark is the row's to draw, so it stays on the
    // row drawn again.
    follow: 'blur',
    drawnMark: true,
    // A right-click on a row (or the menu key on it): its menu. Elsewhere in the list (a stretch's
    // label, between the cards), the browser's.
    onMenu: (item) => {
      const entry = entries.find((each) => each.id === item.id);
      if (!entry) return false;
      setMenuFor(entry);
      return true;
    },
  });

  let waiting: ReactNode = null;
  if (entries.length) waiting = 'No requests match.';
  else if (traffic.connected && record)
    // Text that ends at a line break is a string, which oxfmt can't split at a space: each piece
    // stays one run of text, so it lines up to the pixel as in 0.5.1.
    waiting = (
      <>
        Waiting for requests… Use your app and its <code>fetch</code> and <code>XHR</code>
        {' calls show up here.'}
      </>
    );

  // The menu's actions are the row's own: its button for each, found as the item's picked, does it.
  const rowAction = (entry: LogEntry, id: string) =>
    itemById(entry.id)?.querySelector<HTMLElement>(`[data-action="${id}"]`)?.click();

  return (
    <div
      data-testid="traffic-list"
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
    >
      <div className={`${COLUMN} flex flex-none flex-col gap-2.5 pb-3`}>
        <TrafficFilters
          filter={filter}
          counts={countEntries(entries)}
          search={search}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
        />
        <TrafficNotice traffic={traffic} sites={sites} record={record} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        <RowToolsContext.Provider value={tools}>
          <ContextMenu {...menu}>
            <ContextMenuTrigger
              render={<div ref={ref} className={`${COLUMN} flex flex-col gap-4 pb-4`} />}
              {...handlers}
            >
              {groups.length
                ? groups.map((group) => (
                    <PaneSection
                      key={group.label}
                      label={group.label}
                      className="gap-1.5"
                    >
                      <ItemList>
                        {group.entries.map((entry) => (
                          <RequestRow
                            key={entry.id}
                            entry={entry}
                            selected={entry.id === selectedId}
                            tabbable={entry.id === stop}
                            menuOpen={menuOpen && entry.id === menuFor?.id}
                            onSelect={onSelect}
                          />
                        ))}
                      </ItemList>
                    </PaneSection>
                  ))
                : waiting && <p className="px-1 py-2 text-t50">{waiting}</p>}
            </ContextMenuTrigger>
            <ContextMenuContent>
              {menuFor && (
                <>
                  {ROW_ACTIONS.map((action) => (
                    <DropdownMenuItem
                      key={action.id}
                      data-testid={`request-menu-${action.id}`}
                      onClick={() => rowAction(menuFor, action.id)}
                    >
                      <Icon name={action.icon} /> {action.label}
                    </DropdownMenuItem>
                  ))}
                  {menuFor.ruleId && (
                    <DropdownMenuItem
                      data-testid={`request-menu-${OPEN_RULE.id}`}
                      onClick={() => onOpenRule(menuFor.ruleId!)}
                    >
                      <Icon name={OPEN_RULE.icon} /> {OPEN_RULE.label}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
          {[...tips].map(([action, handle]) => (
            <SharedTooltip key={action.id} handle={handle} />
          ))}
        </RowToolsContext.Provider>
      </div>
    </div>
  );
}
