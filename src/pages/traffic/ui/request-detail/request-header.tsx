// The top of an open request: its method and path (the full URL as its title), and under them its
// status with its name, how long it took and what made it, as chips; the × closes it.
import type { LogEntry } from '../../../../shared/api/index.ts';
import { splitUrl, statusName } from '../../../../shared/lib/index.ts';
import { StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { formatDuration } from '../request-row.tsx';

const KINDS: Record<LogEntry['kind'], string> = {
  fetch: 'fetch()',
  xhr: 'XMLHttpRequest',
};

const CHIP =
  'inline-flex h-7 items-center gap-1.5 rounded-full bg-pressed px-2.5 font-mono text-label text-t80';

export function RequestHeader({
  entry,
  onClose,
}: {
  entry: LogEntry;
  onClose: () => void;
}) {
  const { path } = splitUrl(entry.url);
  const name = entry.status ? statusName(entry.status) : '';
  return (
    <div className="flex flex-none items-start gap-3 px-4 pt-4 pb-3 wide:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h2
          title={entry.url}
          className="line-clamp-2 font-mono text-title font-semibold break-all text-white"
        >
          <span className="mr-2">{entry.method}</span>
          {path}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <span className={CHIP}>
            <StatusCode status={entry.status} failed={Boolean(entry.error)} />
            {name && <span className="font-sans text-t50">{name}</span>}
          </span>
          {entry.duration != null && (
            <span className={CHIP}>{formatDuration(entry.duration)}</span>
          )}
          <span className={CHIP}>{KINDS[entry.kind]}</span>
          {entry.frame && (
            <span className={`${CHIP} min-w-0`}>
              <span className="font-sans text-t50">in</span>
              <span className="truncate">{entry.frame}</span>
            </span>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        title="Close"
        data-testid="request-back"
        onClick={onClose}
        className="flex-none rounded-full bg-pressed text-t80"
      >
        <Icon name="close" size={16} />
      </Button>
    </div>
  );
}
