// The editor's and the popup's copy of the sites you added, and the changes made to it. Changes
// made in another view arrive through chrome.storage.onChanged; the screens redraw through
// useStore(siteStore).
import { createStore } from '../../lib/index.ts';
import type { RuntimeMessage } from '../messages.ts';
import { normalizeSites, siteCovers, siteOf } from './site.ts';

const state = { sites: [] as string[] };
export const siteStore = /* @__PURE__ */ createStore(state);

export async function initSites() {
  const stored = await chrome.storage.local.get({ sites: [] });
  state.sites = normalizeSites(stored.sites);
  chrome.storage.onChanged.addListener((changed, area) => {
    if (area !== 'local' || !changed.sites) return;
    state.sites = normalizeSites(changed.sites.newValue);
    siteStore.emit();
  });
}

// Saves the list of sites you added and resolves once the service worker has re-registered
// the content scripts, so a tab reloaded right after picks up the change.
export async function setSites(sites: string[]) {
  state.sites = normalizeSites(sites);
  await chrome.storage.local.set({ sites: state.sites });
  await chrome.runtime.sendMessage({ type: 'ghostfetch:sync' } satisfies RuntimeMessage);
  siteStore.emit();
}

// Turning Ghostfetch on or off for the site a tab shows: the popup's switch for the tab's site, and
// "Turn on for …" in Traffic. The tab reloads once the background has registered the content
// scripts again, so the change applies to it.

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

// The × on a site you added, in the popup. When that site covers the one the tab shows, the tab
// reloads too, so Ghostfetch leaves it.
export async function removeSite(site: string, tab: chrome.tabs.Tab | undefined) {
  await setSites(siteStore.state.sites.filter((candidate) => candidate !== site));
  const host = siteOf(tab?.url);
  if (host && siteCovers(site, host)) chrome.tabs.reload(tab!.id!);
}
