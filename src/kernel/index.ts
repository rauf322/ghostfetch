// The kernel: what Rules and Interception must agree on, so that the editor can't say what the
// page wouldn't do (GLOSSARY-MAP.md: the two share one answer to which requests a rule matches and
// which header rows a page gets). How a rule's URL pattern matches (url-match.ts) and which
// requests a rule matches (request-match.ts), the one test the page answers by and the editor
// tries with; whether the page gets a rule's header row (header-check.ts); and what a rule's match
// and its answer are made of (rule-parts.ts). The only way into this folder. Plain TypeScript with
// no npm package and no React; of Ghostfetch's own code it may import only lib. The page scripts
// import from here too, and keep only what they use.
export { urlTester } from './url-match.ts';
export { bodyOperation, requestTester } from './request-match.ts';
export type { RuleRequest } from './request-match.ts';
export { headerProblem } from './header-check.ts';
export type {
  BodyMode,
  HeaderRow,
  MatchMode,
  Method,
  RuleMatch,
  RuleResponse,
} from './rule-parts.ts';
