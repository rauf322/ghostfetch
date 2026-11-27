// Puts the theme and the Appearance picked in the editor's ⋯ menu (src/ui/theme.ts) on <html>
// before the page first draws, so no page shows in Ghostfetch's own colours, font or size first;
// and follows a change made in another of Ghostfetch's pages, such as the side panel while the
// editor is open in a tab. A plain script in each page's <head>, as a module would only run after
// the first frame, and a file of the extension's own, as the CSP allows no other.
(() => {
  // Each is remembered as ghostfetch.<name> and put on <html> as data-<name>; a default stores
  // nothing and puts no attribute.
  const NAMES = ['theme', 'contrast', 'font', 'size'];
  const root = document.documentElement;
  const apply = (name, value) => {
    if (value) root.dataset[name] = value;
    else delete root.dataset[name];
  };
  for (const name of NAMES) apply(name, localStorage.getItem(`ghostfetch.${name}`));
  window.addEventListener('storage', (event) => {
    const name = NAMES.find((each) => event.key === `ghostfetch.${each}`);
    if (name) apply(name, event.newValue);
  });
})();
