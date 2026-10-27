// A rule: what it matches and what it does to a request, how it's made and named, and the editor's
// and popup's copy of the rules in storage.
export type {
  BodyMode,
  HeaderRow,
  MatchMode,
  Method,
  Rule,
  RuleType,
} from './model/types.ts';
export {
  BODY_MODES,
  MATCH_HINTS,
  MATCH_MODES,
  METHODS,
  SCRIPT_TEMPLATE,
  TYPES,
} from './model/catalog.ts';
export { createRule, normalizeRule, ruleTitle } from './model/rule.ts';
export { dnrUrlFilter, testUrl } from './model/url-match.ts';
export {
  addRule,
  addRules,
  findRule,
  initRules,
  moveRule,
  removeRule,
  ruleStore,
  touchRule,
} from './model/store.ts';
export type { RuleChange } from './model/store.ts';
