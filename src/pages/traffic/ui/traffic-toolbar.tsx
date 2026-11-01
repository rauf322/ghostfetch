// The bar over the log: the page it watches, then Recording (capture requests), Keep on reload
// (keep them when the page reloads) and Clear. Where the list is narrower than 560 px (a side
// panel), Keep on reload and Clear drop their words for their icons, and Recording for its switch.
import { setFlag } from '../../../shared/api/index.ts';
import type { TrafficSnapshot } from '../../../shared/api/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { Switch } from '../../../shared/ui/kit/switch.tsx';
import { Toggle } from '../../../shared/ui/kit/toggle.tsx';
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
}: {
  traffic: TrafficSnapshot;
  record: boolean;
  preserve: boolean;
  onPick: (id: number | null) => void;
  onPreserveChange: (on: boolean) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-14 flex-none items-center gap-1.5 px-3">
      <TabPicker tabs={traffic.tabs} targetId={traffic.targetId} onPick={onPick} />
      <span className="ml-auto" />
      <label
        title="Capture requests. Rules apply either way."
        className="flex h-8 flex-none cursor-pointer items-center gap-2 rounded-md bg-card pr-1.5 pl-3 text-control font-medium text-t80 @max-[560px]/traffic:pl-1.5"
      >
        <span className={WIDE_ONLY}>Recording</span>
        <Switch
          checked={record}
          onCheckedChange={(on) => setFlag('record', on)}
          aria-label="Recording"
        />
      </label>
      <Toggle
        pressed={preserve}
        onPressedChange={onPreserveChange}
        title="Keep requests when the page reloads"
        className="h-8 border-input"
      >
        <Icon name="history" size={14} className="@[560px]/traffic:hidden" />
        <span className={WIDE_ONLY}>Keep on reload</span>
      </Toggle>
      <Button size="sm" title="Clear the log" onClick={onClear} className="h-8 flex-none">
        <Icon name="trash" size={14} />
        <span className={WIDE_ONLY}>Clear</span>
      </Button>
    </div>
  );
}
