// The title over the server's response in the body's Diff: "Server's response", and when it came
// and its status ("Nov 6, 16:42 · 200"); one cut short adds "the first 1 MB". In a narrow card,
// the time for today's or else the day ("16:42 · 200"), the rest on hover.
import type { ServerResponse } from '../../../../shared/api/index.ts';

export function ResponseTitle({
  server,
  compact,
}: {
  server: ServerResponse;
  compact: boolean;
}) {
  const label = (format: (time: number) => string) =>
    [format(server.time), server.status, server.truncated && 'the first 1 MB']
      .filter(Boolean)
      .join(' · ');
  const full = label((time) => WHEN.format(time));
  return (
    <>
      <span className="flex-none text-t80">Server's response</span>
      <span data-testid="diff-from" title={full} className="min-w-0 truncate text-t40">
        {compact ? label(shortWhen) : full}
      </span>
    </>
  );
}

const WHEN = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const TIME = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const shortWhen = (time: number) =>
  new Date(time).toDateString() === new Date().toDateString()
    ? TIME.format(time)
    : DAY.format(time);
