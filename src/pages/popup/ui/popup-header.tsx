// The popup's header: Ghostfetch's mark and name, and the master switch.
import { MasterSwitch } from '../../../shared/ui/master-switch.tsx';

export function PopupHeader() {
  return (
    <header className="flex h-11 items-stretch border-b border-border">
      <img
        src="/icons/icon32.png"
        width={18}
        height={18}
        alt=""
        className="ml-3.5 self-center"
      />
      <strong className="flex items-center pr-3 pl-[9px] text-small font-bold uppercase tracking-[0.08em] text-t80">
        Ghostfetch
      </strong>
      <MasterSwitch
        title="Turn Ghostfetch on or off"
        className="ml-auto border-l border-border"
      />
    </header>
  );
}
