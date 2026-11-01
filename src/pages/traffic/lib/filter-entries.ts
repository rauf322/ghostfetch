// The requests the list shows, newest first: All, Matched (a rule matched them) or Errors (a
// status of 400 or more, a request that failed, or a rule's error); with a search, only those
// whose method, URL, status or rule name has its text in it, ignoring case.
import type { LogEntry } from '../../../shared/api/index.ts';

export type TrafficFilter = 'all' | 'matched' | 'errors';

const FILTERS: Record<TrafficFilter, (entry: LogEntry) => boolean> = {
  all: () => true,
  matched: (entry) => Boolean(entry.ruleId),
  errors: (entry) =>
    Boolean(entry.error) || entry.action === 'error' || (entry.status ?? 0) >= 400,
};

export function filterEntries(
  entries: LogEntry[],
  filter: TrafficFilter,
  search: string,
) {
  const query = search.trim().toLowerCase();
  return entries
    .filter(
      (entry) =>
        FILTERS[filter](entry) &&
        (!query ||
          `${entry.method} ${entry.url} ${entry.status ?? ''} ${entry.ruleName}`
            .toLowerCase()
            .includes(query)),
    )
    .toReversed();
}

// How many requests each filter shows, for the counts on its pill.
export function countEntries(entries: LogEntry[]): Record<TrafficFilter, number> {
  return {
    all: entries.length,
    matched: entries.filter(FILTERS.matched).length,
    errors: entries.filter(FILTERS.errors).length,
  };
}
