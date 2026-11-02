// The Traffic tab's list, after a bank statement: the page it watches and the switches along the
// top, the filters, a notice when nothing is coming in, then the requests, newest first, in a card
// for each stretch of time ("Just now", "A few minutes ago").
import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  isPreserved,
  rememberPreserve,
  settingsStore,
  siteStore,
} from '../../../shared/api/index.ts';
import type { TrafficLog, TrafficSnapshot } from '../../../shared/api/index.ts';
import { ItemList } from '../../../shared/ui/kit/item.tsx';
import { ListPane, PaneSection } from '../../../shared/ui/list-detail.tsx';
import { countEntries, filterEntries } from '../lib/filter-entries.ts';
import type { TrafficFilter } from '../lib/filter-entries.ts';
import { groupByTime } from '../lib/time-groups.ts';
import { useNow } from '../model/use-now.ts';
import { RequestRow } from './request-row.tsx';
import { TrafficFilters } from './traffic-filters.tsx';
import { TrafficNotice } from './traffic-notice.tsx';
import { TrafficToolbar } from './traffic-toolbar.tsx';

interface TrafficListProps {
  // For the edge that resizes it (SidebarHandle).
  id: string;
  log: TrafficLog;
  traffic: TrafficSnapshot;
  // A request is open, which hides the list in a narrow panel.
  picked: boolean;
  // Hidden beside the open request, in a wide one (SidebarToggle).
  collapsed: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// What's under the toolbar is a column at most this wide, in the middle of a wide window.
const COLUMN = 'mx-auto w-full max-w-[880px] px-3';

export function TrafficList({
  id,
  log,
  traffic,
  picked,
  collapsed,
  selectedId,
  onSelect,
}: TrafficListProps) {
  // Only the two settings the list shows, so it doesn't draw again for the others.
  const record = useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.state.record,
  );
  const sites = useSyncExternalStore(siteStore.subscribe, () => siteStore.state.sites);
  const [preserve, setPreserve] = useState(isPreserved);
  const [filter, setFilter] = useState<TrafficFilter>('all');
  const [search, setSearch] = useState('');
  const now = useNow();
  const { entries } = traffic;
  const groups = groupByTime(filterEntries(entries, filter, search), now);

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

  return (
    <ListPane
      id={id}
      picked={picked}
      collapsed={collapsed}
      className="@container/traffic wide:border-r-0"
    >
      <TrafficToolbar
        traffic={traffic}
        record={record}
        preserve={preserve}
        onPick={(tabId) => {
          onSelect(null);
          log.setTarget(tabId);
        }}
        onPreserveChange={(on) => {
          setPreserve(on);
          rememberPreserve(on);
        }}
        onClear={() => {
          log.clear();
          onSelect(null);
        }}
      />
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
        <div className={`${COLUMN} flex flex-col gap-4 pb-4`}>
          {groups.length
            ? groups.map((group) => (
                <PaneSection key={group.label} label={group.label} className="gap-1.5">
                  <ItemList>
                    {group.entries.map((entry) => (
                      <RequestRow
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedId}
                        onSelect={onSelect}
                      />
                    ))}
                  </ItemList>
                </PaneSection>
              ))
            : waiting && <p className="px-1 py-2 text-t50">{waiting}</p>}
        </div>
      </div>
    </ListPane>
  );
}
