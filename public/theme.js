// Puts the theme picked in the editor's ⋯ menu (src/shared/ui/theme.ts) on <html> before the page
// first draws, so no page shows in Ghostfetch's own colours first; and follows a change made in
// another of Ghostfetch's pages, such as the side panel while the editor is open in a tab. A
// plain script in each page's <head>, as a module would only run after the first frame, and a
// file of the extension's own, as the CSP allows no other.
(() => {
  const KEY = 'ghostfetch.theme';
  const apply = (theme) => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  };
  apply(localStorage.getItem(KEY));
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) apply(event.newValue);
  });
})();
