// The editor's top bar: Ghostfetch's name, the Rules and Traffic tabs with their counts, the
// master switch and the ⋯ menu.
import { ruleStore, settingsStore } from '../../shared/api/index.ts';
import { useStore } from '../../shared/react/index.ts';
import { TabsCount, TabsList, TabsTrigger } from '../../shared/ui/kit/tabs.tsx';
import { MasterSwitch } from '../../shared/ui/master-switch.tsx';
import { EditorMenu } from './editor-menu.tsx';

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
    <header className="flex h-12 flex-none items-stretch gap-2 border-b border-border px-2">
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
          Traffic <TabsCount>{trafficCount || ''}</TabsCount>
        </TabsTrigger>
      </TabsList>
      <div className="ml-auto flex items-stretch">
        <MasterSwitch
          title={
            enabled
              ? 'Ghostfetch is on. Click to turn every rule off.'
              : 'Ghostfetch is off. Click to turn it on.'
          }
        />
        <EditorMenu inTab={inTab} windowId={windowId} onImport={onImport} />
      </div>
    </header>
  );
}
