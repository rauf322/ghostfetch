// The bar along the top of Traffic: the button that hides the sidebar and where you are
// ("Traffic /", beside the sidebar), the page it watches, then Recording (capture requests), Keep
// on reload (keep them when the page reloads) and Clear. Where the view is narrower than 560 px
// (a side panel), Keep on reload and Clear drop their words for their icons, and Recording for its
// switch.
import { setFlag } from '../../../shared/api/index.ts';
import type { TrafficSnapshot } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { SwitchPill } from '../../../shared/ui/kit/switch.tsx';
import { Toggle } from '../../../shared/ui/kit/toggle.tsx';
import { SidebarToggle } from '../../../shared/ui/sidebar.tsx';
import { TabPicker } from './tab-picker.tsx';

// Words that only show from 560 px; a screen reader always has them.
const WIDE_ONLY = '@max-[560px]/traffic:sr-only';

export function TrafficToolbar({
  traffic,
  record,
  preserve,
  onPick,
  onPreserveChange,
  onClear,
  className,
}: {
  traffic: TrafficSnapshot;
  record: boolean;
  preserve: boolean;
  onPick: (id: number) => void;
  onPreserveChange: (on: boolean) => void;
  onClear: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex h-14 flex-none items-center gap-1.5 px-3', className)}>
      <SidebarToggle className="-ml-1" />
      <span className="hidden flex-none text-control text-t40 wide:inline">
        Traffic <span className="text-t30">/</span>
      </span>
      <TabPicker tabs={traffic.tabs} target={traffic.target} onPick={onPick} />
      <span className="ml-auto" />
      <SwitchPill
        checked={record}
        onCheckedChange={(on) => setFlag('record', on)}
        aria-label="Recording"
        title="Capture requests. Rules apply either way."
        className="@max-[560px]/traffic:pl-1.5"
      >
        <span className={WIDE_ONLY}>Recording</span>
      </SwitchPill>
      <Toggle
        pressed={preserve}
        onPressedChange={onPreserveChange}
        title="Keep requests when the page reloads"
        className="border-input"
      >
        <Icon name="history" size={14} className="@[560px]/traffic:hidden" />
        <span className={WIDE_ONLY}>Keep on reload</span>
      </Toggle>
      <Button title="Clear the log" onClick={onClear}>
        <Icon name="trash" size={14} />
        <span className={WIDE_ONLY}>Clear</span>
      </Button>
    </div>
  );
}
