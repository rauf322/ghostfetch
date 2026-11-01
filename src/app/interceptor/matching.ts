// Which response rule a request gets: the first whose method, URL pattern and (for GraphQL)
// operation name match it. The URL patterns are made into tests once, as the rules arrive, by
// urlTester, which the editor's URL tester uses too.
import { urlTester } from '../../shared/api/index.ts';
import type { Rule } from '../../shared/api/index.ts';
import type { Compiled, PageRequest, PageRules } from './types.ts';

export function compile(rules: Rule[]) {
  const compiled: Compiled[] = [];
  for (const rule of rules) {
    try {
      compiled.push({ rule, test: urlTester(rule.match || {}) });
    } catch {
      // Invalid regex: the editor already shows the error, so just skip the rule.
    }
  }
  return compiled;
}

export function findRule(state: PageRules, request: PageRequest) {
  if (!state.enabled) return null;
  for (const { rule, test } of state.rules) {
    const { method = 'ANY', graphqlOperation = '' }: Partial<Rule['match']> =
      rule.match || {};
    if (method !== 'ANY' && method !== request.method) continue;
    if (!test(request.url)) continue;
    if (graphqlOperation.trim() && operationName(request) !== graphqlOperation.trim())
      continue;
    return rule;
  }
  return null;
}

function operationName({ url, body }: PageRequest) {
  if (body) {
    try {
      const parsed = JSON.parse(body);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      if (first?.operationName) return first.operationName;
      const named = /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(
        first?.query || '',
      );
      if (named) return named[1];
    } catch {
      // Not JSON, fall through to the query string.
    }
  }
  try {
    return new URL(url).searchParams.get('operationName') || '';
  } catch {
    return '';
  }
}
