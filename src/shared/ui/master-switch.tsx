// Ghostfetch's master switch, with an On / Off word next to it, in the popup's header: the one
// place Ghostfetch is turned off as a whole, every rule paused until it's turned on again. The
// editor has no switch of its own; it says when Ghostfetch is off.
import { setFlag, settingsStore } from '../api/index.ts';
import { useStore } from '../react/index.ts';
import { cn } from './cn.ts';
import { Switch } from './kit/switch.tsx';

export function MasterSwitch({
  className,
  title,
}: {
  className?: string;
  title: string;
}) {
  const { enabled } = useStore(settingsStore);
  return (
    <label
      title={title}
      className={cn(
        'flex cursor-pointer items-center gap-2 px-2 text-control font-medium whitespace-nowrap',
        enabled ? 'text-t80' : 'text-t40',
        className,
      )}
    >
      <Switch checked={enabled} onCheckedChange={(on) => setFlag('enabled', on)} />
      <span>{enabled ? 'On' : 'Off'}</span>
    </label>
  );
}
