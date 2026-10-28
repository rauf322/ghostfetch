// The editor's top bar, a row of cells like the site's header: Ghostfetch's name, the Rules and
// Traffic tabs with their counts, the master switch and the ⋯ menu.
import { ruleStore, settingsStore } from '../../shared/api/index.ts';
import { useStore } from '../../shared/react/index.ts';
import { TabsCount, TabsList, TabsTrigger } from '../../shared/ui/kit/tabs.tsx';
import { MasterSwitch } from '../../shared/ui/master-switch.tsx';
import { EditorMenu } from './editor-menu.tsx';

// Tab counts are zero-padded, like the rule numbers: "Rules 08".
const pad = (count: number) => String(count).padStart(2, '0');

export function TopBar({
  trafficCount,
  inTab,
  windowId,
  onImport,
}: {
  trafficCount: number;
  inTab: boolean;
  windowId: number;
  onImport: () => void;
}) {
  const { enabled } = useStore(settingsStore);
  const { rules } = useStore(ruleStore);
  return (
    <header className="flex h-10 flex-none items-stretch border-b border-border">
      <div className="flex items-center gap-2 pr-[9px] pl-3 text-meta font-bold whitespace-nowrap uppercase tracking-[0.08em] text-t65">
        <img src="/icons/icon32.png" width={16} height={16} alt="" />
        <span className="max-[390px]:hidden">Ghostfetch</span>
      </div>
      <TabsList>
        <TabsTrigger value="rules" data-testid="tab-rules">
          Rules <TabsCount>{rules.length ? pad(rules.length) : ''}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="traffic" data-testid="tab-traffic">
          Traffic <TabsCount>{trafficCount ? pad(trafficCount) : ''}</TabsCount>
        </TabsTrigger>
      </TabsList>
      <div className="ml-auto flex items-stretch">
        <MasterSwitch
          title={
            enabled
              ? 'Ghostfetch is on. Click to turn every rule off.'
              : 'Ghostfetch is off. Click to turn it on.'
          }
          className="border-l border-border"
        />
        <EditorMenu inTab={inTab} windowId={windowId} onImport={onImport} />
      </div>
    </header>
  );
}
