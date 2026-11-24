// Which response rule a request gets: the first that matches it, by its method, its URL pattern
// and (for GraphQL) its operation name. Each rule is made into a test once, as the rules arrive,
// by requestTester, which the editor tries a request with too.
import { requestTester } from '../../shared-kernel/index.ts';
import type { PageRule } from '../rules/index.ts';
import type { Compiled, PageRequest, PageRules } from './types.ts';

export function compile(rules: PageRule[]) {
  const compiled: Compiled[] = [];
  for (const rule of rules) {
    try {
      compiled.push({ rule, test: requestTester(rule.match || {}) });
    } catch {
      // A rule whose test can't be made: a regex that doesn't compile, which the editor already
      // shows, or an operation that isn't text, which the bridge's rebuilding already makes none.
      // Skip it.
    }
  }
  return compiled;
}

export function findRule(state: PageRules, request: PageRequest) {
  if (!state.enabled) return null;
  for (const { rule, test } of state.rules) if (test(request)) return rule;
  return null;
}
