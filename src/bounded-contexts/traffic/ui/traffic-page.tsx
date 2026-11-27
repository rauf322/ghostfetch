// Traffic: the live log of the fetch/XHR calls in a tab, and a request's details in a drawer
// beside it, whose one big button, Mock this response, turns the captured response into an
// editable rule. The bar along the top (the page it watches, and its switches) spans the view;
// under it, with nothing open the list has the whole width. Where there's room for both (700 px
// wide, `beside:`; the view is a size container, traffic), the drawer floats as a card beside the
// list; in a narrower one (a side panel, or beside a wide sidebar) it takes the view, bar and
// all, with a button to close it.
//
// Esc shuts the open request as that button does, from anywhere in the view but a field or a
// popup of its own (a menu, the page picker), which take the key first. Shut, focus goes back to
// its row, where it was in the drawer (or left with it); opened from the keyboard where the list
// gives way to it, focus goes to its name at the drawer's top.
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Rule } from '../../rules/index.ts';
import { isPreserved, recordingStore, rememberPreserve } from '../index.ts';
import type { LogEntry, TrafficLog } from '../index.ts';
import { useTraffic } from './use-traffic-log.ts';
import { RequestDetail } from './request-detail/request-detail.tsx';
import { TrafficList, requestButton } from './traffic-list.tsx';
import { TrafficToolbar } from './traffic-toolbar.tsx';

interface TrafficPageProps {
  // The editor's log of the tab it watches (useTrafficLog).
  log: TrafficLog;
  // Mock this response: the editor places the rule, in the group New rule would start in.
  onMock: (draft: Rule, entry: LogEntry) => void;
  onOpenRule: (id: string) => void;
}

const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

// Memoized: it only draws again when its own log changes (and the one setting it shows,
// Recording), not on every rule edit. The count beside the view's name reads the log itself
// (app/sidepanel), so a request draws neither the editor nor its rules again.
export const TrafficPage = memo(function TrafficPage({
  log,
  onMock,
  onOpenRule,
}: TrafficPageProps) {
  const traffic = useTraffic(log);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const recording = useSyncExternalStore(
    recordingStore.subscribe,
    () => recordingStore.state.recording,
  );
  const [preserve, setPreserve] = useState(isPreserved);
  const view = useRef<HTMLDivElement>(null);
  const { entries } = traffic;
  const selected = entries.find((entry) => entry.id === selectedId);
  const close = useCallback(() => setSelectedId(null), []);
  // With a request open, the bar and the list give way to it where there's no room for both.
  const yielding = selected ? 'hidden beside:flex' : undefined;

  // Focus, as a request opens and shuts (see the top).
  const shown = useRef<string | null>(null);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = selected ? selected.id : null;
    const active = document.activeElement;
    if (was && !selected) {
      if (!active || active === document.body || !active.isConnected)
        requestButton(view.current, was)?.focus();
    } else if (selected && selected.id !== was) {
      if (active && view.current?.contains(active) && !active.checkVisibility())
        view.current
          .querySelector<HTMLElement>('[data-testid="request-detail"] h2')
          ?.focus({ preventScroll: true });
    }
  }, [selected]);

  // Esc, wherever focus is in the view, or nowhere while the view shows.
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as Element;
      if (event.key !== 'Escape' || event.defaultPrevented || target.closest?.(FIELD))
        return;
      const here = view.current;
      if (
        !here ||
        !(here.contains(target) || (target === document.body && here.checkVisibility()))
      )
        return;
      event.preventDefault();
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  return (
    <div ref={view} className="@container/traffic flex h-full min-h-0 flex-col">
      <TrafficToolbar
        traffic={traffic}
        record={recording}
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
          record={recording}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMock={onMock}
          onOpenRule={onOpenRule}
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
