// The requests in groups by how long ago they were made, as a bank statement groups its payments
// by day: "Just now", "1 minute ago", "12 minutes ago", then "Over an hour ago". `entries` come
// newest first, and so do the groups.
import type { LogEntry } from '../../../shared/api/index.ts';

export interface TimeGroup {
  label: string;
  entries: LogEntry[];
}

export function groupByTime(entries: LogEntry[], now: number): TimeGroup[] {
  const groups = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const label = ago(now - entry.time);
    const group = groups.get(label);
    if (group) group.push(entry);
    else groups.set(label, [entry]);
  }
  return [...groups].map(([label, grouped]) => ({ label, entries: grouped }));
}

function ago(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  return 'Over an hour ago';
}
