// Traffic tab: the live log of the fetch/XHR calls in a tab, and a request's details in a drawer
// beside it, whose one big button, Mock this response, turns the captured response into an
// editable rule. With nothing open the list has the whole width; with a request open, the list is
// a sidebar you can resize by its edge (between it and the drawer) or hide (SidebarToggle, in
// the drawer), and the drawer has the rest. In a narrow side panel the drawer takes the list's
// place, with a button to close it.
import { memo, useCallback, useEffect, useState } from 'react';
import type { Rule, TrafficLog } from '../../../shared/api/index.ts';
import { useTraffic } from '../../../shared/react/index.ts';
import { Split } from '../../../shared/ui/list-detail.tsx';
import { SidebarHandle, useSidebarHidden } from '../../../shared/ui/sidebar.tsx';
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
  // The list only gives way to an open request: with none, it's all there is.
  const collapsed = useSidebarHidden() && Boolean(selected);

  useEffect(() => onCount(entries.length), [entries.length, onCount]);

  return (
    <Split view="traffic" open={Boolean(selected)} collapsed={collapsed}>
      <TrafficList
        id="traffic-list"
        log={log}
        traffic={traffic}
        picked={Boolean(selected)}
        collapsed={collapsed}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selected && (
        <>
          <SidebarHandle view="traffic" list="traffic-list" />
          <RequestDetail
            entry={selected}
            full={collapsed}
            onClose={close}
            onMock={onMock}
            onOpenRule={onOpenRule}
          />
        </>
      )}
    </Split>
  );
});
