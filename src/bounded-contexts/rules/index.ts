// Rules: what Ghostfetch should answer, and which rule wins (its words are in
// docs/glossary/rules.md). A rule and a group, what they're made of and the words the screens show
// for them, making them, whether a rule is answering and what's wrong with one, and the order and
// every operation on it (domain/); the screens' copy of the order, which saves it and redraws after
// each operation, and of whether Ghostfetch is paused, a copy of a group, a rule made from a
// request in the log, the server's responses the bodies' Diff compares with, and what the page is
// given (application/); where the order is kept and the toolbar badge (infrastructure/); and what
// the bridge sends the interceptor (contract.ts). One of the folder's two doors, the one with no
// React; the screens (ui/) have the other, ui/index.ts, and a file for each widget other screens
// show. New rule's draft, which the screens take by path with the few other things only they use,
// isn't offered here: its NEW_DRAFT is made with a spread, which the bundler counts as a side
// effect, so a door that offered it would load it into the popup. Plain TypeScript with no npm
// package, as is all of the folder but ui/; of Ghostfetch's own code it may import only the shared
// kernel, lib, platform and bounded-contexts/traffic/index.ts, and its domain/ only the shared
// kernel and lib. The background and the page scripts import from here too, and keep only what
// they use.
export type { Group, Rule } from './domain/types.ts';
export { BODY_MODES, MATCH_MODES, MAX_DELAY, METHODS } from './domain/catalog.ts';
export {
  createRule,
  isResponseRule,
  normalizeRule,
  normalizeRules,
  ruleTitle,
} from './domain/rule.ts';
export {
  NEW_GROUP,
  createGroup,
  freeName,
  groupName,
  nameTaken,
  normalizeGroups,
  offGroups,
} from './domain/group.ts';
export type { StoredGroup } from './domain/group.ts';
export { duplicateGroup } from './application/duplicate-group.ts';
export { graphqlOperation, ruleFromEntry } from './application/rule-from-entry.ts';
export { isAnswering, wouldAnswer } from './domain/answering.ts';
export { bodyProblem, hasJsonBody, regexError } from './domain/problems.ts';
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
} from './application/server-responses.ts';
export type { ServerResponse } from './application/server-responses.ts';
export { layOut } from './domain/order.ts';
export type { Entry, GroupEntry, Place, Renamed, RuleEntry } from './domain/order.ts';
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
  rulesWritten,
  saveRulesNow,
  storedGroups,
  touchRule,
  turnGroup,
  ungroup,
} from './application/store.ts';
export type { RuleChange } from './application/store.ts';
export { initPaused, pausedStore, setPaused } from './application/paused.ts';
export type { PageRule, PageState } from './contract.ts';
export { pageState } from './application/page-state.ts';
export { updateBadge } from './infrastructure/badge.ts';
