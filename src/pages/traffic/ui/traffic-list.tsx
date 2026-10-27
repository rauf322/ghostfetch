// The Traffic tab's list: the page it watches and the filter along the top, a notice when nothing
// is coming in, how many requests there are and how many a rule matched, the requests (newest
// first), and the bar of switches under them.
import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { settingsStore } from '../../../entities/settings/index.ts';
import { siteStore } from '../../../entities/site/index.ts';
import { Label } from '../../../shared/ui/kit/label.tsx';
import {
  List,
  ListEmpty,
  ListPane,
  PaneToolbar,
  SearchField,
  SectionRow,
} from '../../../shared/ui/list-detail/index.ts';
import { filterEntries } from '../lib/filter-entries.ts';
import { isPreserved, rememberPreserve } from '../model/preserve.ts';
import type { TrafficLog, TrafficSnapshot } from '../model/traffic-log.ts';
import { RequestRow } from './request-row.tsx';
import { TabPicker } from './tab-picker.tsx';
import { TrafficFooter } from './traffic-footer.tsx';
import { TrafficNotice } from './traffic-notice.tsx';

interface TrafficListProps {
  log: TrafficLog;
  traffic: TrafficSnapshot;
  // A request is open, which hides the list in a narrow panel.
  picked: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function TrafficList({
  log,
  traffic,
  picked,
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
  const [onlyMatched, setOnlyMatched] = useState(false);
  const [filter, setFilter] = useState('');
  const { entries } = traffic;
  const visible = filterEntries(entries, filter, onlyMatched);
  const hits = entries.filter((entry) => entry.action).length;

  let waiting: ReactNode = null;
  if (entries.length) waiting = 'No requests match the filter.';
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
    <ListPane picked={picked}>
      <TabPicker
        tabs={traffic.tabs}
        targetId={traffic.targetId}
        onPick={(id) => {
          onSelect(null);
          log.setTarget(id);
        }}
      />
      <PaneToolbar>
        <SearchField
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by URL, method, status, rule"
          title="Filter by URL, method, status or rule name"
          aria-label="Filter requests"
        />
      </PaneToolbar>
      <TrafficNotice traffic={traffic} sites={sites} record={record} />
      <SectionRow>
        <Label>{`${entries.length} ${entries.length === 1 ? 'request' : 'requests'}`}</Label>
        <Label className="tracking-wider">{hits ? `${hits} matched a rule` : ''}</Label>
      </SectionRow>

      <List>
        {visible.length
          ? visible.map((entry) => (
              <RequestRow
                key={entry.id}
                entry={entry}
                selected={entry.id === selectedId}
                onSelect={onSelect}
              />
            ))
          : waiting && (
              <ListEmpty>
                <p>{waiting}</p>
              </ListEmpty>
            )}
      </List>

      <TrafficFooter
        record={record}
        preserve={preserve}
        onPreserveChange={(on) => {
          setPreserve(on);
          rememberPreserve(on);
        }}
        onlyMatched={onlyMatched}
        onOnlyMatchedChange={setOnlyMatched}
        onClear={() => {
          log.clear();
          onSelect(null);
        }}
      />
    </ListPane>
  );
}
