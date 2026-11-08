// The editor's top bar, in a narrow side panel: Ghostfetch's name, the Rules and Traffic tabs
// with their counts, and the ⋯ menu. From 760px wide the sidebar has all of these (sidebar.tsx),
// and the bar is gone.
import { ruleStore } from '../../shared/api/index.ts';
import type { TrafficLog } from '../../shared/api/index.ts';
import { useStore, useTrafficValue } from '../../shared/react/index.ts';
import { TabsCount, TabsList, TabsTrigger } from '../../shared/ui/kit/tabs.tsx';
import { EditorMenu } from './editor-menu.tsx';

export function TopBar({
  log,
  inTab,
  windowId,
  onImport,
}: {
  // The editor's log of the page it watches, for the Traffic tab's count.
  log: TrafficLog;
  inTab: boolean;
  windowId: number;
  onImport: () => void;
}) {
  const { rules } = useStore(ruleStore);
  return (
    <header className="flex h-12 flex-none items-stretch gap-2 border-b border-border px-2 wide:hidden">
      <div className="flex items-center gap-2 pr-1 pl-1.5 text-title font-semibold whitespace-nowrap text-foreground">
        <img
          src="/icons/icon32.png"
          width={18}
          height={18}
          alt=""
          className="rounded-[4px]"
        />
        <span className="max-[390px]:hidden">Ghostfetch</span>
      </div>
      <TabsList>
        <TabsTrigger value="rules" data-testid="tab-rules">
          Rules <TabsCount>{rules.length || ''}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="traffic" data-testid="tab-traffic">
          Traffic <TrafficCount log={log} />
        </TabsTrigger>
      </TabsList>
      <div className="ml-auto flex items-stretch">
        <EditorMenu inTab={inTab} windowId={windowId} onImport={onImport} />
      </div>
    </header>
  );
}

// The Traffic tab's count, how many requests the log has: it alone draws again as they arrive.
function TrafficCount({ log }: { log: TrafficLog }) {
  const count = useTrafficValue(log, (traffic) => traffic.entries.length);
  return <TabsCount>{count || ''}</TabsCount>;
}
