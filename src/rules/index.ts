// Rules: what Ghostfetch should answer, and which rule wins (its words are in
// docs/glossary/rules.md). A rule and a group, what they're made of and the words the screens show
// for them, making them, whether a rule is answering and what's wrong with one, the order and every
// operation on it, and what a search shows of it (domain/); the screens' copy of the order, which
// saves it and redraws after each operation, a copy of a group or of a rule, a rule made from a
// request in the log, the requests New rule offers to mock, the
// server's responses the bodies' Diff compares with, and what the page is given (application/);
// where the order is kept, the toolbar badge, and the clipboard a rule's body editor pastes from
// (infrastructure/); and what the bridge sends the interceptor (contract.ts). The only way into
// this folder. Plain TypeScript with no npm package and no React; of Ghostfetch's own code it may
// import only the kernel, lib, platform and traffic/index.ts, and its domain/ only the kernel and
// lib. The background and the page scripts import from here too, and keep only what they use.
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
  saveRulesNow,
  storedGroups,
  touchRule,
  turnGroup,
  ungroup,
} from './application/store.ts';
export type { RuleChange } from './application/store.ts';
export type { PageRule, PageState } from './contract.ts';
export { pageState } from './application/page-state.ts';
export { updateBadge } from './infrastructure/badge.ts';
export { filterEntries } from './domain/filter-rules.ts';
export { duplicateRule } from './application/duplicate-rule.ts';
export { recentRequests } from './application/recent-requests.ts';
export { systemClipboard } from './infrastructure/clipboard.ts';
