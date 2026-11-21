// What's wrong with a rule, as facts: a URL regex that doesn't compile, and the first mistake in a
// JSON body. The rule editor marks them and says them in its words (pages/rules), the agent's
// tools in theirs (pages/agent), and both ask here, so neither can call a rule sound that the
// other calls broken. (A header row the page won't get is headerProblem, header-check.ts.)
import { checkJson } from '../../lib/index.ts';
import type { Rule } from './types.ts';

// A URL regex that doesn't compile, in the browser's words; '' for one that does, and for a
// pattern that isn't a regex or is empty. A rule with one matches no request: the page passes it
// over.
export function regexError({ match }: Pick<Rule, 'match'>) {
  if (match.mode !== 'regex' || !match.url.trim()) return '';
  try {
    RegExp(match.url.trim()); // throws a SyntaxError if the pattern doesn't compile
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

// Whether a rule's body is checked as JSON: a body of the rule's own (Replace), under a
// Content-Type that says JSON. A rule that keeps the server's body has none of its own to check.
export function hasJsonBody({ response }: Pick<Rule, 'response'>) {
  return response.bodyMode === 'replace' && /json/i.test(response.contentType);
}

// The first mistake in a rule's JSON body (checkJson), or null: for a valid one, and for a body
// that isn't checked (hasJsonBody).
export function bodyProblem(rule: Pick<Rule, 'response'>) {
  return hasJsonBody(rule) ? checkJson(rule.response.body) : null;
}
