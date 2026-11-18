// What the popup says about a rule: what it matches, on one line, and what it did on the tab's
// page, in words.
import type { Rule, RuleCount } from '../../../shared/api/index.ts';

// "GET /api/me"; a GraphQL rule's operation after its URL; a rule for any method without one.
export function matchLine({ match }: Rule) {
  const url = match.url.trim();
  const operation = match.graphqlOperation.trim();
  const what =
    [url, operation && `operation ${operation}`].filter(Boolean).join(' · ') || 'Any URL';
  return match.method === 'ANY' ? what : `${match.method} ${what}`;
}

// What it did on the page: "2 mocked", "1 modified · 1 failed"; '' when it hasn't answered there.
export function didWords(count: RuleCount | undefined) {
  if (!count) return '';
  return [
    count.mocked > 0 && `${count.mocked} mocked`,
    count.modified > 0 && `${count.modified} modified`,
    count.failed > 0 && `${count.failed} failed`,
  ]
    .filter(Boolean)
    .join(' · ');
}
