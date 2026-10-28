// Which response rule a request gets: the first whose method, URL pattern and (for GraphQL)
// operation name match it. The URL patterns are made into tests once, as the rules arrive.
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

function urlTester({
  url = '',
  mode = 'contains',
  graphqlOperation = '',
}: Partial<Rule['match']>): (candidate: string) => boolean {
  const pattern = url.trim();
  if (!pattern) return () => Boolean(graphqlOperation.trim());
  if (mode === 'regex') {
    const regex = new RegExp(pattern);
    return (candidate) => regex.test(candidate);
  }
  if (mode === 'wildcard') {
    const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
    return (candidate) => regex.test(candidate);
  }
  if (mode === 'equals') {
    return (candidate) =>
      candidate === pattern || (pattern.startsWith('/') && pathOf(candidate) === pattern);
  }
  return (candidate) => candidate.includes(pattern);
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

function pathOf(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function escapeRegex(text: string) {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
