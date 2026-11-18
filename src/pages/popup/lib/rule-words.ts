// What the popup says about a rule: what it matches, on one line. (What it did on the tab's page,
// in words, is shared/api's countWords, which the editor's rule list says too.)
import type { Rule } from '../../../shared/api/index.ts';

// "GET /api/me"; a GraphQL rule's operation after its URL; a rule for any method without one.
export function matchLine({ match }: Rule) {
  const url = match.url.trim();
  const operation = match.graphqlOperation.trim();
  const what =
    [url, operation && `operation ${operation}`].filter(Boolean).join(' · ') || 'Any URL';
  return match.method === 'ANY' ? what : `${match.method} ${what}`;
}
