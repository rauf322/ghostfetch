// The popup's header: Ghostfetch's mark and name, then two buttons that say what they're set to.
// Recording: whether requests are recorded, for Traffic and for what each rule did on a page.
// Pause: Ghostfetch off as a whole, every rule with it, until Resume; the one place to do that.
import { setFlag } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Icon } from '../../../shared/ui/kit/icon.tsx';

export function PopupHeader({ enabled, record }: { enabled: boolean; record: boolean }) {
  return (
    <header className="flex h-[30px] items-center gap-2 px-0.5">
      <img
        src="/icons/icon32.png"
        width={18}
        height={18}
        alt=""
        className="rounded-[4px]"
      />
      <strong className="text-title font-semibold text-foreground">Ghostfetch</strong>
      <button
        type="button"
        data-testid="record"
        aria-pressed={record}
        title={
          record
            ? 'Stop recording requests'
            : 'Record requests, for Traffic and for what each rule does on a page'
        }
        onClick={() => setFlag('record', !record)}
        className={cn(
          'ml-auto flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-label font-medium transition-colors',
          record
            ? 'bg-signal-soft text-signal'
            : 'border border-input text-t50 hover:text-foreground',
        )}
      >
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full', record ? 'bg-signal' : 'bg-t40')}
        />
        {record ? 'Recording' : 'Not recording'}
      </button>
      {enabled ? (
        <button
          type="button"
          data-testid="pause"
          aria-label="Pause Ghostfetch"
          title="Pause Ghostfetch: no rule answers anything until you resume"
          onClick={() => setFlag('enabled', false)}
          className="flex size-[26px] items-center justify-center rounded-full border border-input text-t65 transition-colors hover:text-foreground"
        >
          <Icon name="pause" size={12} />
        </button>
      ) : (
        <button
          type="button"
          data-testid="resume"
          title="Resume Ghostfetch: its rules answer again"
          onClick={() => setFlag('enabled', true)}
          className="flex h-[26px] items-center gap-1.5 rounded-full bg-foreground px-2.5 text-label font-semibold text-inverse hover:brightness-110"
        >
          <Icon name="play" size={11} />
          Resume
        </button>
      )}
    </header>
  );
}
