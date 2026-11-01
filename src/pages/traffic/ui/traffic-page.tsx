// Traffic tab: the live log of the fetch/XHR calls in a tab, and a request's details in a drawer
// beside it, whose one big button, Mock this response, turns the captured response into an
// editable rule. With nothing open the list has the whole width; in a narrow side panel the
// drawer takes the list's place, with a button to close it.
import { memo, useCallback, useEffect, useState } from 'react';
import type { Rule, TrafficLog } from '../../../shared/api/index.ts';
import { useTraffic } from '../../../shared/react/index.ts';
import { RequestDetail } from './request-detail/request-detail.tsx';
import { TrafficList } from './traffic-list.tsx';

interface TrafficPageProps {
  // The editor's log of the tab it watches (useTrafficLog).
  log: TrafficLog;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
  onCount: (count: number) => void;
}

// Memoized: it only draws again when its own log changes (and the list when the settings it shows
// do), not on every rule edit.
export const TrafficPage = memo(function TrafficPage({
  log,
  onMock,
  onOpenRule,
  onCount,
}: TrafficPageProps) {
  const traffic = useTraffic(log);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { entries } = traffic;
  const selected = entries.find((entry) => entry.id === selectedId);
  const close = useCallback(() => setSelectedId(null), []);

  useEffect(() => onCount(entries.length), [entries.length, onCount]);

  return (
    <div className="flex h-full min-h-0">
      <TrafficList
        log={log}
        traffic={traffic}
        picked={Boolean(selected)}
        selectedId={selectedId}
        onSelect={setSelectedId}
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
  );
});
