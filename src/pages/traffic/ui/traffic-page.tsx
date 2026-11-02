// Traffic tab: the live log of the fetch/XHR calls in a tab, and a request's details in a drawer
// beside it, whose one big button, Mock this response, turns the captured response into an
// editable rule. With nothing open the list has the whole width; with the list hidden
// (SidebarToggle, in the drawer) the drawer has it, the two columns trading their share of the
// room as it slides. In a narrow side panel the drawer takes the list's place, with a button to
// close it.
import { memo, useCallback, useEffect, useState } from 'react';
import type { Rule, TrafficLog } from '../../../shared/api/index.ts';
import { useTraffic } from '../../../shared/react/index.ts';
import { useSidebarHidden } from '../../../shared/ui/sidebar.tsx';
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
    <div
      data-open={selected ? '' : undefined}
      data-collapsed={collapsed || undefined}
      // The collapsed columns name both attributes, so they outrank the open ones.
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] wide:data-open:grid-cols-[minmax(0,1fr)_minmax(min(44%,600px),0fr)] wide:data-open:data-collapsed:grid-cols-[minmax(0,0fr)_minmax(min(44%,600px),1fr)] motion-safe:transition-[grid-template-columns] motion-safe:duration-200 motion-safe:ease-out"
    >
      <TrafficList
        log={log}
        traffic={traffic}
        picked={Boolean(selected)}
        collapsed={collapsed}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selected && (
        <RequestDetail
          entry={selected}
          full={collapsed}
          onClose={close}
          onMock={onMock}
          onOpenRule={onOpenRule}
        />
      )}
    </div>
  );
});
