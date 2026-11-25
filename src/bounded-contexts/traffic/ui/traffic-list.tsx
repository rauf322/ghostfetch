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
// their tooltips (row-tools.ts), drawn here once.
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
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
// A row, and the button that opens its request, which the keys move between.
const ROW = '[data-testid="request"]';
const OPEN = '[data-row-open]';

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
  const list = useRef<HTMLDivElement>(null);
  // The rows' tooltips, made once, and Mock this response, made again only when the editor's
  // onMock changes (the group a new rule goes into was picked), which draws the rows' actions
  // again, not the rows.
  const [tips] = useState(createRowTips);
  const tools = useMemo(
    () => ({ tips, mock: (entry: LogEntry) => mockEntry(entry, onMock) }),
    [tips, onMock],
  );
  // The row focus is in now (null while it's outside the list), and the one it was in last.
  const [focused, setFocused] = useState<string | null>(null);
  const [lastFocused, setLastFocused] = useState<string | null>(null);
  // The request the right-click menu is for, and the row it's marked open on.
  const [menuFor, setMenuFor] = useState<LogEntry | null>(null);
  const marked = useRef<HTMLElement | null>(null);
  const stop =
    [focused, selectedId, lastFocused].find(
      (id) => id !== null && shown.some((entry) => entry.id === id),
    ) ??
    shown[0]?.id ??
    null;

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

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const open = event.target as HTMLElement;
    if (
      !open.matches(OPEN) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const rows = [...(list.current?.querySelectorAll<HTMLElement>(OPEN) ?? [])];
    const index = rows.indexOf(open);
    let to: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        to = rows[index + 1];
        break;
      case 'ArrowUp':
        to = rows[index - 1];
        break;
      case 'Home':
        to = rows[0];
        break;
      case 'End':
        to = rows.at(-1);
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
    const row = (event.target as Element).closest<HTMLElement>(ROW);
    if (row?.dataset.entry && event.currentTarget.contains(row))
      setFocused(row.dataset.entry);
  }

  function onBlur(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (focused) setLastFocused(focused);
    setFocused(null);
  }

  // A right-click on a row (or the menu key on it): its menu, the row marked as having it open.
  // Elsewhere in the list (a stretch's label, between the cards), the browser's.
  function onContextMenu(
    event: MouseEvent<HTMLElement> & { preventBaseUIHandler: () => void },
  ) {
    const row = (event.target as Element).closest<HTMLElement>(ROW);
    const entry = row && entries.find((each) => each.id === row.dataset.entry);
    if (!row || !entry) {
      event.preventBaseUIHandler();
      event.stopPropagation();
      return;
    }
    marked.current?.removeAttribute('data-context-open');
    row.setAttribute('data-context-open', '');
    marked.current = row;
    setMenuFor(entry);
  }

  // The menu's actions are the row's own: its button for each, found as the item's picked, does it.
  const rowAction = (entry: LogEntry, id: string) =>
    list.current
      ?.querySelector<HTMLElement>(
        `${ROW}[data-entry="${CSS.escape(entry.id)}"] [data-action="${id}"]`,
      )
      ?.click();

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
          <ContextMenu
            onOpenChange={(open) => {
              if (open) return;
              marked.current?.removeAttribute('data-context-open');
              marked.current = null;
            }}
          >
            <ContextMenuTrigger
              render={<div ref={list} className={`${COLUMN} flex flex-col gap-4 pb-4`} />}
              onContextMenu={onContextMenu}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
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
