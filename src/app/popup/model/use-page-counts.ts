// What each rule did on the tab's page (askPageCounts), asked as the popup opens and every 2 s
// while it's open, so a rule that answers meanwhile shows up. undefined until the page's first
// answer, which takes a few milliseconds; null while Ghostfetch isn't running on the page.
import { useEffect, useState } from 'react';
import { askPageCounts } from '../../../bounded-contexts/traffic/index.ts';
import type { PageCounts } from '../../../bounded-contexts/traffic/index.ts';

export function usePageCounts(tabId: number | undefined, runsHere: boolean) {
  const [counts, setCounts] = useState<PageCounts | null>();
  const asking = runsHere && tabId !== undefined;
  useEffect(() => {
    if (!asking || tabId === undefined) return undefined;
    const id = tabId;
    let open = true;
    // The last answer, as text: an answer the same as it draws nothing again.
    let last = '';
    const ask = () =>
      askPageCounts(id).then((next) => {
        const seen = JSON.stringify(next);
        if (!open || seen === last) return;
        last = seen;
        setCounts(next);
      });
    ask();
    const timer = setInterval(ask, 2000);
    return () => {
      open = false;
      clearInterval(timer);
    };
  }, [asking, tabId]);
  return asking ? counts : null;
}
