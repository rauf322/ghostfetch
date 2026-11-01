// How a rule's URL pattern matches, for the editor's URL tester: as the page-world interceptor
// applies it (app/interceptor/matching.ts), case-sensitive. Throws if the pattern is an invalid
// regex.
import type { Rule } from './types.ts';

export function testUrl(rule: Rule, url: string) {
  const pattern = rule.match.url.trim();
  const { mode } = rule.match;
  if (!pattern) return false;
  if (mode === 'regex') return new RegExp(pattern).test(url);
  if (mode === 'wildcard')
    return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`).test(url);
  if (mode === 'equals')
    return url === pattern || (pattern.startsWith('/') && pathOf(url) === pattern);
  return url.includes(pattern);
}

function pathOf(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
