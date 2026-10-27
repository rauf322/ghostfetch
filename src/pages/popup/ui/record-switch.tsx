// Whether requests are recorded for the Traffic tab.
import { setFlag } from '../../../entities/settings/index.ts';
import { cn } from '../../../shared/lib/class-names/index.ts';
import { Switch } from '../../../shared/ui/kit/switch.tsx';

export function RecordSwitch({ record, dimmed }: { record: boolean; dimmed: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-border px-3.5 py-[11px] text-control uppercase tracking-wider text-t65',
        dimmed && 'opacity-55',
      )}
    >
      <span>Record traffic</span>
      <Switch
        size="sm"
        checked={record}
        onCheckedChange={(on) => setFlag('record', on)}
        aria-label="Record traffic"
      />
    </div>
  );
}
