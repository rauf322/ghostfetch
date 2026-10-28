// The editor's and the popup's copy of the sites you added. Changes made in another view arrive
// through chrome.storage.onChanged; the screens redraw through useStore(siteStore).
import { createStore } from '../../lib/index.ts';
import { normalizeSites } from './site.ts';

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
  await chrome.runtime.sendMessage({ type: 'ghostfetch:sync' });
  siteStore.emit();
}
