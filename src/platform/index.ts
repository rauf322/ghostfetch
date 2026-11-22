// What differs between the browsers, and opening the editor: Chrome's side panel or Firefox's
// sidebar (side-panel.ts, with what @types/chrome lacks of Firefox in firefox.d.ts), and the
// editor opened in it or in a tab, and on a rule the popup picked (open-editor.ts). Plain
// TypeScript with no npm package and no React; of Ghostfetch's own code it may import only lib.
// An adapter over the browsers, not a bounded context (docs/development.md, "Files").
export {
  openInSidePanel,
  openInTab,
  openRuleInEditor,
  watchRuleRequests,
} from './open-editor.ts';
export { openSidePanel } from './side-panel.ts';
