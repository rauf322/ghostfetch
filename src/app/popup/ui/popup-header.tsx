// The popup's header: Ghostfetch's mark and name, then two buttons that say what they're set to.
// Recording: whether requests are recorded, for Traffic and for what each rule did on a page.
// Pause: Ghostfetch off as a whole, every rule with it, until Resume; the one place to do that.
import { setPaused } from '../../../bounded-contexts/rules/index.ts';
import { setRecording } from '../../../bounded-contexts/traffic/index.ts';
import { cn } from '../../../ui/cn.ts';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';

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
      <Tooltip
        label={
          record
            ? 'Stop recording requests'
            : 'Record requests, for Traffic and for what each rule does on a page'
        }
      >
        <button
          type="button"
          data-testid="record"
          aria-pressed={record}
          onClick={() => setRecording(!record)}
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
      </Tooltip>
      {enabled ? (
        <Tooltip label="Pause Ghostfetch: no rule answers anything until you resume">
          <button
            type="button"
            data-testid="pause"
            aria-label="Pause Ghostfetch"
            onClick={() => setPaused(true)}
            className="flex size-[26px] items-center justify-center rounded-full border border-input text-t65 transition-colors hover:text-foreground"
          >
            <Icon name="pause" size={12} />
          </button>
        </Tooltip>
      ) : (
        <Tooltip label="Resume Ghostfetch: its rules answer again">
          <button
            type="button"
            data-testid="resume"
            onClick={() => setPaused(false)}
            className="flex h-[26px] items-center gap-1.5 rounded-full bg-foreground px-2.5 text-label font-semibold text-inverse hover:brightness-110"
          >
            <Icon name="play" size={11} />
            Resume
          </button>
        </Tooltip>
      )}
    </header>
  );
}
