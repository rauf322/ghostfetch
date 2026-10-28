// Ghostfetch's master switch, with an On / Off word next to it: in the popup's header and the
// editor's top bar. The word drops out in a side panel narrower than 330px.
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
        'flex cursor-pointer items-center gap-2 px-[9px] text-control whitespace-nowrap uppercase tracking-wider',
        enabled ? 'text-t80' : 'text-t40',
        className,
      )}
    >
      <Switch checked={enabled} onCheckedChange={(on) => setFlag('enabled', on)} />
      <span className="max-[330px]:hidden">{enabled ? 'On' : 'Off'}</span>
    </label>
  );
}
