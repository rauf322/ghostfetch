// The requests the list shows, newest first: with Matched on, only those a rule matched; with a
// filter, only those whose method, URL, status or rule name has its text in it, ignoring case.
import type { LogEntry } from '../../../shared/api/index.ts';

export function filterEntries(entries: LogEntry[], filter: string, onlyMatched: boolean) {
  const query = filter.trim().toLowerCase();
  return entries
    .filter(
      (entry) =>
        (!onlyMatched || entry.ruleId) &&
        (!query ||
          `${entry.method} ${entry.url} ${entry.status ?? ''} ${entry.ruleName}`
            .toLowerCase()
            .includes(query)),
    )
    .toReversed();
}
