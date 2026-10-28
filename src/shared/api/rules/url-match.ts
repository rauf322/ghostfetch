// How a rule's URL pattern matches: the editor's URL tester, and the urlFilter the background gives
// declarativeNetRequest for redirect, header and block rules.
import type { MatchMode, Rule } from './types.ts';

// The declarativeNetRequest urlFilter for redirect, header and block rules.
export function dnrUrlFilter(mode: MatchMode, pattern: string) {
  if (mode === 'equals') return pattern.includes('://') ? `|${pattern}|` : `${pattern}|`;
  if (mode === 'wildcard') return `|${pattern}|`;
  return pattern;
}

// Mirrors how a rule's URL pattern is applied: by the page-world interceptor for response rules
// (case-sensitive) and by Chrome's declarativeNetRequest for everything else
// (case-insensitive urlFilter syntax). Throws if the pattern is an invalid regex.
export function testUrl(rule: Rule, url: string) {
  const pattern = rule.match.url.trim();
  const { mode } = rule.match;
  if (!pattern) return false;
  if (mode === 'regex')
    return new RegExp(pattern, rule.type === 'response' ? '' : 'i').test(url);
  if (rule.type !== 'response')
    return urlFilterRegex(dnrUrlFilter(mode, pattern)).test(url);
  if (mode === 'wildcard')
    return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`).test(url);
  if (mode === 'equals')
    return url === pattern || (pattern.startsWith('/') && pathOf(url) === pattern);
  return url.includes(pattern);
}

function urlFilterRegex(filter: string) {
  let source = '';
  let start = 0;
  let end = filter.length;
  if (filter.startsWith('||')) {
    source = '^[a-z][a-z0-9+.-]*://(?:[^/?#]*\\.)?';
    start = 2;
  } else if (filter.startsWith('|')) {
    source = '^';
    start = 1;
  }
  const anchoredEnd = end > start && filter.endsWith('|');
  if (anchoredEnd) end -= 1;
  for (const char of filter.slice(start, end)) {
    if (char === '*') source += '.*';
    else if (char === '^') source += '(?:[^A-Za-z0-9_\\-.%]|$)';
    else source += escapeRegex(char);
  }
  return new RegExp(anchoredEnd ? `${source}$` : source, 'i');
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
