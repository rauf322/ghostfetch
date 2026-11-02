// The popup's header: Ghostfetch's mark and name, and the master switch.
import { MasterSwitch } from '../../../shared/ui/master-switch.tsx';

export function PopupHeader() {
  return (
    <header className="flex h-9 items-stretch">
      <img
        src="/icons/icon32.png"
        width={18}
        height={18}
        alt=""
        className="ml-1 self-center rounded-[4px]"
      />
      <strong className="flex items-center pl-2 text-title font-semibold text-foreground">
        Ghostfetch
      </strong>
      <MasterSwitch title="Turn Ghostfetch on or off" className="ml-auto pr-0.5" />
    </header>
  );
}
