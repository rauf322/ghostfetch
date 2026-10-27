// declarativeNetRequest matches the page that started a request by domain only, so local.*
// hosts can't be listed up front the way localhost can. Each one is remembered the first time
// a tab opens it and added to the rules' initiators, which means requests made during that
// very first load can miss redirect, header and block rules. Response rules aren't affected.
import { isLocalPrefixHost, siteOf } from '../../entities/site/index.ts';
import { loadState } from './stored-state.ts';

const MAX_LOCAL_HOSTS = 50;

let hostQueue = Promise.resolve();
export function rememberLocalHost(url: string) {
  const host = siteOf(url);
  if (!isLocalPrefixHost(host)) return;
  hostQueue = hostQueue
    .then(async () => {
      const { localHosts } = await loadState();
      if (localHosts.includes(host)) return;
      await chrome.storage.local.set({
        localHosts: [...localHosts, host].slice(-MAX_LOCAL_HOSTS),
      });
    })
    .catch((error) => console.error('[Ghostfetch] could not remember host', error));
}

// The local.* hosts of every tab open when the background starts.
export async function rememberOpenTabs() {
  for (const tab of await chrome.tabs.query({})) if (tab.url) rememberLocalHost(tab.url);
}
