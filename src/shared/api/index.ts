// What Ghostfetch keeps in chrome.storage, and what its parts send each other: the rules
// (and apart from them, the server's responses their bodies are compared with) and the
// sites you added (each with the screens' copy of them), the two switches, a
// request in a tab's traffic log and the editor's live copy of that log (with its Keep on
// reload setting), the popup's count of what each rule did on a page, and the messages between
// the background, the page scripts and the screens. No React and no npm package: the background
// and the page scripts import from here too, and keep only what they use.
export type {
  BodyMode,
  Group,
  HeaderRow,
  MatchMode,
  Method,
  Rule,
} from './rules/types.ts';
export { BODY_MODES, MATCH_MODES, MAX_DELAY, METHODS } from './rules/catalog.ts';
export {
  createRule,
  isResponseRule,
  normalizeRule,
  normalizeRules,
  ruleTitle,
} from './rules/rule.ts';
export {
  NEW_GROUP,
  createGroup,
  freeName,
  groupName,
  nameTaken,
  normalizeGroups,
  offGroups,
} from './rules/group.ts';
export type { StoredGroup } from './rules/group.ts';
export { duplicateGroup } from './rules/duplicate-group.ts';
export { graphqlOperation, ruleFromEntry } from './rules/rule-from-entry.ts';
export { headerProblem } from './rules/header-check.ts';
export { urlTester } from './rules/url-match.ts';
export { requestTester } from './rules/request-match.ts';
export type { RuleRequest } from './rules/request-match.ts';
export { isAnswering, wouldAnswer } from './rules/answering.ts';
export { bodyProblem, hasJsonBody, regexError } from './rules/problems.ts';
export {
  copyServerResponse,
  createResponseCapture,
  entryTester,
  fromServer,
  initServerResponses,
  keepServerResponse,
  responseFromEntry,
  responseStore,
  serverResponse,
} from './rules/server-responses.ts';
export type { ServerResponse } from './rules/server-responses.ts';
export { layOut } from './rules/order.ts';
export type { Entry, GroupEntry, Place, Renamed, RuleEntry } from './rules/order.ts';
export {
  addEntries,
  addGroup,
  addRule,
  addRules,
  editRule,
  findGroup,
  findGroupNamed,
  findRule,
  groupOf,
  groupPosition,
  inOffGroup,
  initRules,
  moveGroup,
  moveGroupTo,
  moveRule,
  moveRuleTo,
  placeAt,
  placeOf,
  removeGroup,
  removeRule,
  renameGroup,
  restoreGroup,
  ruleRevision,
  ruleStore,
  saveRulesNow,
  storedGroups,
  touchRule,
  turnGroup,
  ungroup,
} from './rules/store.ts';
export type { RuleChange } from './rules/store.ts';
export {
  isBuiltInHost,
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
export { createTrafficLog } from './traffic-log.ts';
export type { TrafficLog, TrafficSnapshot, TrafficTab } from './traffic-log.ts';
export { isPreserved, rememberPreserve } from './preserve.ts';
export { LOG_PORT } from './messages.ts';
export type {
  LogPortMessage,
  LogViewerMessage,
  PageCounts,
  PageLog,
  PageRule,
  PageState,
  RuleCount,
  RuntimeMessage,
} from './messages.ts';
export { askPageCounts, countRule, countWords } from './page-counts.ts';
