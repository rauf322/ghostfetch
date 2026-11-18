// How often each rule has answered on a tab's page, which the popup shows ("2 mocked"). The tab's
// top-frame bridge (src/app/bridge/) counts its traffic log and answers with the counts alone,
// none of the log's URLs or bodies, so the popup opens as quickly however long the log is.
import type { PageCounts, RuntimeMessage } from './messages.ts';

// null when Ghostfetch isn't running on the page: not a site it runs on, or a page that loaded
// before Ghostfetch was installed or turned on there, until it reloads.
export async function askPageCounts(tabId: number): Promise<PageCounts | null> {
  try {
    const counts: unknown = await chrome.tabs.sendMessage(
      tabId,
      { type: 'ghostfetch:counts' } satisfies RuntimeMessage,
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
