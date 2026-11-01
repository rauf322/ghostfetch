// What Ghostfetch keeps in chrome.storage, and what its parts send each other: the rules and the
// sites you added (each with the screens' copy of them), the two switches, a request in a tab's
// traffic log, the messages between the background, the page scripts and the screens, and opening
// the editor. No React and no npm package: the background and the page scripts import from here
// too, and keep only what they use.
export type { BodyMode, HeaderRow, MatchMode, Method, Rule } from './rules/types.ts';
export { BODY_MODES, MATCH_HINTS, MATCH_MODES, METHODS } from './rules/catalog.ts';
export {
  createRule,
  isResponseRule,
  normalizeRule,
  normalizeRules,
  ruleTitle,
} from './rules/rule.ts';
export { urlTester } from './rules/url-match.ts';
export {
  addRule,
  addRules,
  editRule,
  findRule,
  initRules,
  moveRule,
  removeRule,
  ruleStore,
  touchRule,
} from './rules/store.ts';
export type { RuleChange } from './rules/store.ts';
export {
  BUILT_IN_SITES,
  isBuiltInHost,
  isLocalPrefixHost,
  isSiteEnabled,
  normalizeSite,
  normalizeSites,
  siteCovers,
  siteMatchPatterns,
  siteOf,
} from './sites/site.ts';
export {
  initSites,
  removeSite,
  setSites,
  siteStore,
  turnOffFor,
  turnOnFor,
} from './sites/store.ts';
export { initSettings, setFlag, settingsStore } from './settings.ts';
export type { Settings } from './settings.ts';
export type { EntryAction, EntryKind, LogEntry } from './log-entry.ts';
export { LOG_PORT } from './messages.ts';
export type {
  LogPortMessage,
  LogViewerMessage,
  PageLog,
  PageState,
  RuntimeMessage,
} from './messages.ts';
export {
  openInSidePanel,
  openInTab,
  openRuleInEditor,
  watchRuleRequests,
} from './open-editor.ts';
