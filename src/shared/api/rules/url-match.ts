// How a rule's URL pattern matches, made into a test once: the one the page's interceptor answers
// requests by (app/interceptor/matching.ts) and the one the editor's URL tester tries a URL with
// (pages/rules/lib/rule-checks.ts), so the Match tab can't say anything the page wouldn't do.
// Case-sensitive. With no pattern, every URL matches if the rule names a GraphQL operation (which
// then decides alone, from the request) and none does otherwise. Throws if the pattern is a regex
// that doesn't compile. Every field has a default: the page gets the rules as they're stored.
// test/matching.mjs checks the cases.
import type { Rule } from './types.ts';

export function urlTester({
  url = '',
  mode = 'contains',
  graphqlOperation = '',
}: Partial<Rule['match']>): (candidate: string) => boolean {
  const pattern = url.trim();
  if (!pattern) {
    const any = Boolean(graphqlOperation.trim());
    return () => any;
  }
  if (mode === 'regex') {
    const regex = new RegExp(pattern);
    return (candidate) => regex.test(candidate);
  }
  if (mode === 'wildcard') {
    const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
    return (candidate) => regex.test(candidate);
  }
  if (mode === 'equals')
    return (candidate) =>
      candidate === pattern || (pattern.startsWith('/') && pathOf(candidate) === pattern);
  return (candidate) => candidate.includes(pattern);
}

// The path and query of a full URL, which an equals pattern starting with / is compared with.
function pathOf(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
