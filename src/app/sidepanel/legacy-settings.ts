// The editor's own settings (the Vim switch, Preserve, and the tab it last showed) were saved
// under "mocktail." names up to 0.6.0. They move to their "ghostfetch." names once.
export function moveLegacySettings() {
  for (const name of ['vim', 'view', 'preserveLog']) {
    const saved = localStorage.getItem(`mocktail.${name}`);
    if (saved === null) continue;
    if (localStorage.getItem(`ghostfetch.${name}`) === null)
      localStorage.setItem(`ghostfetch.${name}`, saved);
    localStorage.removeItem(`mocktail.${name}`);
  }
}
