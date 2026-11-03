// Traffic: the live log of the fetch/XHR calls in a tab, and a request's details in a drawer
// beside it, whose one big button, Mock this response, turns the captured response into an
// editable rule. The bar along the top (the page it watches, and its switches) spans the view;
// under it, with nothing open the list has the whole width. Where there's room for both (700 px
// wide, `beside:`; the view is a size container, traffic), the drawer floats as a card beside the
// list; in a narrower one (a side panel, or beside a wide sidebar) it takes the view, bar and
// all, with a button to close it.
import { memo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  isPreserved,
  rememberPreserve,
  settingsStore,
} from '../../../shared/api/index.ts';
import type { Rule, TrafficLog } from '../../../shared/api/index.ts';
import { useTraffic } from '../../../shared/react/index.ts';
import { RequestDetail } from './request-detail/request-detail.tsx';
import { TrafficList } from './traffic-list.tsx';
import { TrafficToolbar } from './traffic-toolbar.tsx';

interface TrafficPageProps {
  // The editor's log of the tab it watches (useTrafficLog).
  log: TrafficLog;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
  onCount: (count: number) => void;
}

// Memoized: it only draws again when its own log changes (and the one setting it shows,
// Recording), not on every rule edit.
export const TrafficPage = memo(function TrafficPage({
  log,
  onMock,
  onOpenRule,
  onCount,
}: TrafficPageProps) {
  const traffic = useTraffic(log);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const record = useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.state.record,
  );
  const [preserve, setPreserve] = useState(isPreserved);
  const { entries } = traffic;
  const selected = entries.find((entry) => entry.id === selectedId);
  const close = useCallback(() => setSelectedId(null), []);
  // With a request open, the bar and the list give way to it where there's no room for both.
  const yielding = selected ? 'hidden beside:flex' : undefined;

  useEffect(() => onCount(entries.length), [entries.length, onCount]);

  return (
    <div className="@container/traffic flex h-full min-h-0 flex-col">
      <TrafficToolbar
        traffic={traffic}
        record={record}
        preserve={preserve}
        onPick={(tabId) => {
          setSelectedId(null);
          log.setTarget(tabId);
        }}
        onPreserveChange={(on) => {
          setPreserve(on);
          rememberPreserve(on);
        }}
        onClear={() => {
          log.clear();
          setSelectedId(null);
        }}
        className={yielding}
      />
      <div className="flex min-h-0 flex-1">
        <TrafficList
          traffic={traffic}
          record={record}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className={yielding}
        />
        {selected && (
          <RequestDetail
            entry={selected}
            onClose={close}
            onMock={onMock}
            onOpenRule={onOpenRule}
          />
        )}
      </div>
    </div>
  );
});
