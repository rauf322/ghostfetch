// Traffic tab: live log of the fetch/XHR calls in a tab, with a detail pane and
// "Mock this response", which turns a captured response into an editable rule.
import { memo, useCallback, useEffect, useState } from 'react';
import type { Rule } from '../../../shared/api/index.ts';
import { DetailPane, Split } from '../../../shared/ui/list-detail.tsx';
import { useTrafficLog } from '../model/use-traffic-log.ts';
import { NoRequestSelected } from './no-request.tsx';
import { RequestDetail } from './request-detail/request-detail.tsx';
import { TrafficList } from './traffic-list.tsx';

interface TrafficPageProps {
  // The side panel follows the active tab; the editor in a tab keeps the tab it picked.
  followActiveTab: boolean;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
  onCount: (count: number) => void;
}

// Memoized: it only draws again when its own log changes (and the list when the settings it shows
// do), not on every rule edit.
export const TrafficPage = memo(function TrafficPage({
  followActiveTab,
  onMock,
  onOpenRule,
  onCount,
}: TrafficPageProps) {
  const { log, traffic } = useTrafficLog(followActiveTab);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { entries } = traffic;
  const selected = entries.find((entry) => entry.id === selectedId);
  const back = useCallback(() => setSelectedId(null), []);

  useEffect(() => onCount(entries.length), [entries.length, onCount]);

  return (
    <Split>
      <TrafficList
        log={log}
        traffic={traffic}
        picked={Boolean(selected)}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <DetailPane picked={Boolean(selected)}>
        {selected ? (
          <RequestDetail
            entry={selected}
            onBack={back}
            onMock={onMock}
            onOpenRule={onOpenRule}
          />
        ) : (
          <NoRequestSelected />
        )}
      </DetailPane>
    </Split>
  );
});
