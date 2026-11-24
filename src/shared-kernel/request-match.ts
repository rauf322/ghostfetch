// Which requests a rule matches, made into a test once: its method, its URL by the rule's pattern
// (urlTester), and for GraphQL its operation, which a request names in its body or else in its
// URL. The one test the page's interceptor answers requests by
// (bounded-contexts/interception/matching.ts), the editor keeps a rule's server's response by
// (entryTester, bounded-contexts/rules/application/server-responses.ts) and the agent's try_url
// tries a request with, so neither of those two can say what the page wouldn't do. Throws, as
// urlTester does, if the pattern is a regex that doesn't compile, and if the operation isn't
// text. Every field has a default all the same, a second line behind the bridge, which gives the
// page each rule as the editor reads it. test/matching.mjs checks the cases.
import type { RuleMatch } from './rule-parts.ts';
import { urlTester } from './url-match.ts';

// A request as a rule sees it: its method, its full URL, and its body as text ('' with none).
export interface RuleRequest {
  method: string;
  url: string;
  body: string;
}

export function requestTester(
  match: Partial<RuleMatch>,
): (request: RuleRequest) => boolean {
  const { method = 'ANY', graphqlOperation = '' } = match;
  const url = urlTester(match);
  const operation = graphqlOperation.trim();
  return (request) =>
    (method === 'ANY' || method === request.method) &&
    url(request.url) &&
    (!operation || requestOperation(request) === operation);
}

// The GraphQL operation a request names: the one its body names (bodyOperation), or else its
// URL's operationName; '' when it names none.
function requestOperation({ url, body }: RuleRequest): unknown {
  const named = body ? bodyOperation(body) : undefined;
  if (named) return named;
  try {
    return new URL(url).searchParams.get('operationName') || '';
  } catch {
    return '';
  }
}

// The operation a GraphQL request's body names: its operationName, or else the name after query,
// mutation or subscription; undefined when it names none or isn't JSON. As the body has it: a page
// can put anything there, and an operationName that isn't text is still the body's say, which no
// rule's operation is equal to.
export function bodyOperation(body: string): unknown {
  try {
    const parsed = JSON.parse(body);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return (
      first?.operationName ||
      /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(first?.query || '')?.[1]
    );
  } catch {
    return undefined;
  }
}
