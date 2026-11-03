// The editor's own settings (the Vim switch, Preserve, and the tab it last showed) were saved
// under "mocktail." names up to 0.6.0. They move to their "ghostfetch." names once. And from
// 0.15.0 to 0.16.2 the Rules and Traffic tabs' lists each had a width of their own; the Rules
// tab's becomes the sidebar's, and the Traffic tab's goes.
export function moveLegacySettings() {
  for (const name of ['vim', 'view', 'preserveLog']) {
    const saved = localStorage.getItem(`mocktail.${name}`);
    if (saved === null) continue;
    if (localStorage.getItem(`ghostfetch.${name}`) === null)
      localStorage.setItem(`ghostfetch.${name}`, saved);
    localStorage.removeItem(`mocktail.${name}`);
  }
  const width = localStorage.getItem('ghostfetch.sidebar-width.rules');
  if (width !== null && localStorage.getItem('ghostfetch.sidebar-width') === null)
    localStorage.setItem('ghostfetch.sidebar-width', width);
  localStorage.removeItem('ghostfetch.sidebar-width.rules');
  localStorage.removeItem('ghostfetch.sidebar-width.traffic');
}
