// What the rule editor says about what you typed: whether a URL matches the pattern, and whether a
// body is valid JSON (and if not, where it goes wrong). What's wrong with a rule is shared/api's
// to say (regexError, hasJsonBody), as the agent's tools ask it too; this puts it in the editor's
// words.
import { urlTester } from '../../../kernel/index.ts';
import { hasJsonBody } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
import { checkJson } from '../../../lib/index.ts';
import type { JsonProblem } from '../../../lib/index.ts';

// Whether `url` matches the rule's pattern, as the page decides it (urlTester), or why the pattern
// can't be tried.
export function testResult(
  rule: Rule,
  url: string,
): { tone: 'good' | 'bad'; text: string } {
  try {
    if (!urlTester(rule.match)(url))
      return { tone: 'bad', text: 'No match: this rule leaves it alone' };
    return {
      tone: 'good',
      text: rule.match.graphqlOperation.trim()
        ? 'The URL matches; the GraphQL operation is checked on each request'
        : 'Matches: this rule would answer it',
    };
  } catch (error) {
    return { tone: 'bad', text: (error as Error).message };
  }
}

// What the line under the body says: whether a JSON body is valid. A mistake that has a place
// comes with it (`problem`), for the body editor to mark.
export interface CodeStatus {
  tone?: 'good' | 'bad';
  text: string;
  problem?: JsonProblem;
}

// Nothing for a rule that keeps the server's body, or one whose Content-Type isn't JSON.
export function codeStatus(rule: Rule): CodeStatus | null {
  if (!hasJsonBody(rule)) return null;
  const { response } = rule;
  const problem = checkJson(response.body);
  // An empty body is a mistake with no place to mark.
  if (problem && problem.to <= problem.from)
    return { tone: 'bad', text: problem.message };
  if (problem)
    return {
      tone: 'bad',
      text: `Line ${problem.line}: ${sentenceCase(problem.message)}`,
      problem,
    };
  const lines = response.body.split('\n').length;
  return {
    tone: 'good',
    text: `Valid JSON · ${lines} ${lines === 1 ? 'line' : 'lines'}`,
  };
}

// "Missing comma after 42" as it reads after "Line 2: ", keeping words like "JSON" whole.
function sentenceCase(message: string) {
  return /^[A-Z][a-z]/.test(message)
    ? message[0]!.toLowerCase() + message.slice(1)
    : message;
}
