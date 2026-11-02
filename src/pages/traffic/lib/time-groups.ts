// The requests in groups by how long ago they were made, as a bank statement groups its payments
// by day: a handful of stretches ("Just now", "A few minutes ago", "About 10 minutes ago"), so a
// session's log reads as a few cards rather than one a minute. `entries` come newest first, and
// so do the groups.
import type { LogEntry } from '../../../shared/api/index.ts';

// Each stretch ends `until` minutes ago.
const STRETCHES: [until: number, label: string][] = [
  [1, 'Just now'],
  [5, 'A few minutes ago'],
  [15, 'About 10 minutes ago'],
  [45, 'About half an hour ago'],
  [90, 'About an hour ago'],
  [Infinity, 'Over an hour ago'],
];

export function groupByTime(entries: LogEntry[], now: number) {
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
  const minutes = ms / 60_000;
  return STRETCHES.find(([until]) => minutes < until)![1];
}
