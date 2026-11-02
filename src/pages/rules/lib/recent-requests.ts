// What New rule offers to mock: the page's latest requests that no rule answered, one for each
// method and path, newest first, at most five. `entries` come oldest first, as the log keeps them.
import type { LogEntry } from '../../../shared/api/index.ts';
import { splitUrl } from '../../../shared/lib/index.ts';

const LIMIT = 5;

export function recentRequests(entries: LogEntry[]) {
  const seen = new Set<string>();
  const recent: LogEntry[] = [];
  for (let at = entries.length - 1; at >= 0 && recent.length < LIMIT; at--) {
    const entry = entries[at]!;
    const key = `${entry.method} ${splitUrl(entry.url).path}`;
    if (entry.ruleId || seen.has(key)) continue;
    seen.add(key);
    recent.push(entry);
  }
  return recent;
}
