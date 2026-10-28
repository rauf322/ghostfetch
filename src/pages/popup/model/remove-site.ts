// The × on a site you added. When that site covers the one the tab shows, the tab reloads once the
// content scripts are registered again, so Ghostfetch leaves it.
import { setSites, siteCovers, siteOf, siteStore } from '../../../shared/api/index.ts';

export async function removeSite(site: string, tab: chrome.tabs.Tab | undefined) {
  await setSites(siteStore.state.sites.filter((candidate) => candidate !== site));
  const host = siteOf(tab?.url);
  if (host && siteCovers(site, host)) chrome.tabs.reload(tab!.id!);
}
