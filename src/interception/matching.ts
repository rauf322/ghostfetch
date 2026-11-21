// Which response rule a request gets: the first that matches it, by its method, its URL pattern
// and (for GraphQL) its operation name. Each rule is made into a test once, as the rules arrive,
// by requestTester, which the editor tries a request with too.
import { requestTester } from '../kernel/index.ts';
import type { PageRule } from '../shared/api/index.ts';
import type { Compiled, PageRequest, PageRules } from './types.ts';

export function compile(rules: PageRule[]) {
  const compiled: Compiled[] = [];
  for (const rule of rules) {
    try {
      compiled.push({ rule, test: requestTester(rule.match || {}) });
    } catch {
      // Invalid regex: the editor already shows the error, so just skip the rule.
    }
  }
  return compiled;
}

export function findRule(state: PageRules, request: PageRequest) {
  if (!state.enabled) return null;
  for (const { rule, test } of state.rules) if (test(request)) return rule;
  return null;
}
