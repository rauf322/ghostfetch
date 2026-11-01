// Whether requests are recorded for the Traffic tab.
import { setFlag } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Switch } from '../../../shared/ui/kit/switch.tsx';

export function RecordSwitch({ record, dimmed }: { record: boolean; dimmed: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg bg-card px-3.5 py-2.5 text-control text-t80',
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
