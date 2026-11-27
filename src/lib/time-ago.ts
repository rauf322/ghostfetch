// How long ago something happened, in as few characters as a row has room for: "now" under a
// minute, then whole minutes, hours and days, rounded down ("4m", "2h", "3d"), as T3 Code's sidebar
// says when a thread last moved. A time a little ahead of the clock (another clock's, or one that
// hasn't ticked yet) is "now" too.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(ms: number) {
  if (ms < MINUTE) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}
