// The bar along the top of Traffic: the button that hides the sidebar and where you are
// ("Traffic /", beside the sidebar), the page it watches, then whether requests are recorded
// (Recording, which the toolbar popup starts and stops), Keep on reload (keep them when the page
// reloads) and Clear. Where the view is narrower than 560 px (a side panel), Keep on reload and
// Clear drop their words for their icons.
import type { TrafficSnapshot } from '../index.ts';
import { cn } from '../../../ui/cn.ts';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { SignalDot } from '../../../ui/kit/signal-dot.tsx';
import { Toggle } from '../../../ui/kit/toggle.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { SidebarToggle } from '../../../ui/sidebar.tsx';
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
      <Tooltip
        label={
          record
            ? 'Requests are recorded. Stop recording in the toolbar popup; rules apply either way.'
            : 'Requests aren’t recorded. Start recording in the toolbar popup; rules apply either way.'
        }
      >
        <span
          data-testid="record"
          className={cn(
            'flex flex-none items-center gap-1.5 px-1.5 text-control font-medium whitespace-nowrap',
            record ? 'text-signal' : 'text-t50',
          )}
        >
          <SignalDot on={record} />
          {record ? 'Recording' : 'Not recording'}
        </span>
      </Tooltip>
      <Tooltip label="Keep requests when the page reloads">
        <Toggle
          pressed={preserve}
          onPressedChange={onPreserveChange}
          className="border-input"
        >
          <Icon name="history" size={14} className="@[560px]/traffic:hidden" />
          <span className={WIDE_ONLY}>Keep on reload</span>
        </Toggle>
      </Tooltip>
      <Tooltip label="Clear the log">
        <Button aria-label="Clear the log" onClick={onClear}>
          <Icon name="trash" size={14} />
          <span className={WIDE_ONLY}>Clear</span>
        </Button>
      </Tooltip>
    </div>
  );
}
