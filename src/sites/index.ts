// Sites: where Ghostfetch runs (its words are in docs/glossary/sites.md). The built-in hosts and
// the sites you added, and whether Ghostfetch runs on a URL (site.ts); the screens' copy of the
// sites you added, and turning Ghostfetch on or off for one (store.ts); the content scripts the
// background registers for the sites you added (content-scripts.ts); and the message that asks it
// to (contract.ts). The only way into this folder. Plain TypeScript with no npm package and no
// React; of Ghostfetch's own code it may import only lib and platform. The background imports
// from here too, and keeps only what it uses.
export {
  isBuiltInHost,
  isSiteEnabled,
  normalizeSite,
  normalizeSites,
  siteCovers,
  siteMatchPatterns,
  siteOf,
} from './site.ts';
export {
  initSites,
  removeSite,
  setSites,
  siteStore,
  turnOffFor,
  turnOnFor,
} from './store.ts';
export { syncContentScripts } from './content-scripts.ts';
export type { SyncMessage } from './contract.ts';
