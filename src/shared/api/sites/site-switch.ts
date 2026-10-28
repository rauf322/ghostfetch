// Turning Ghostfetch on or off for the site a tab shows: the popup's switch for the tab's site, and
// "Turn on for …" in Traffic. The tab reloads once the background has registered the content
// scripts again, so the change applies to it.
import { siteCovers } from './site.ts';
import { setSites, siteStore } from './store.ts';

// A site you add covers its subdomains too.
export async function turnOnFor(host: string, tabId: number) {
  await setSites([...siteStore.state.sites, host]);
  chrome.tabs.reload(tabId);
}

// Every site you added that covers `host` goes.
export async function turnOffFor(host: string, tabId: number) {
  await setSites(siteStore.state.sites.filter((site) => !siteCovers(site, host)));
  chrome.tabs.reload(tabId);
}
