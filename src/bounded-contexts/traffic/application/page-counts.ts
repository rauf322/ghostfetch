// How often each rule has answered on a tab's page, which the popup shows ("2 mocked"), as does
// the editor's rule list for the page it watches. The tab's log in its top frame
// (infrastructure/tab-log.ts, which the bridge starts) counts what it holds and answers the popup
// with the counts alone, none of the log's URLs or bodies, so the popup opens as quickly however
// long the log is.
import type { LogEntry } from '../domain/log-entry.ts';
import type { CountsMessage, PageCounts, RuleCount } from '../contract.ts';

// What a rule did, in words: "2 mocked", "1 modified · 1 failed"; '' when it hasn't answered.
export function countWords(count: RuleCount | undefined) {
  if (!count) return '';
  return [
    count.mocked > 0 && `${count.mocked} mocked`,
    count.modified > 0 && `${count.modified} modified`,
    count.failed > 0 && `${count.failed} failed`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// How often one rule answered among a page's requests, by what it did, as the tab's log counts them
// for the popup: a request the page gave up on before the rule answered (action '') is none of
// them.
export function countRule(entries: readonly LogEntry[], ruleId: string): RuleCount {
  const count = { mocked: 0, modified: 0, failed: 0 };
  for (const { ruleId: id, action } of entries) {
    if (id !== ruleId || !action) continue;
    count[action === 'error' ? 'failed' : action] += 1;
  }
  return count;
}

// null when Ghostfetch isn't running on the page: not a site it runs on, or a page that loaded
// before Ghostfetch was installed or turned on there, until it reloads.
export async function askPageCounts(tabId: number): Promise<PageCounts | null> {
  try {
    const counts: unknown = await chrome.tabs.sendMessage(
      tabId,
      { type: 'ghostfetch:counts' } satisfies CountsMessage,
      { frameId: 0 },
    );
    return isPageCounts(counts) ? counts : null;
  } catch {
    // No bridge in the page to answer.
    return null;
  }
}

function isPageCounts(value: unknown): value is PageCounts {
  const counts = value as PageCounts | null;
  return (
    typeof counts?.record === 'boolean' &&
    typeof counts.rules === 'object' &&
    counts.rules !== null
  );
}
