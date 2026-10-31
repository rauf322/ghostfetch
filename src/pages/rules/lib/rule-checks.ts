// What the rule editor says about what you typed: a regex that doesn't compile, whether a URL
// matches the pattern, and whether a body is valid JSON (and if not, where it goes wrong).
import { testUrl } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
import { checkJson } from '../../../shared/lib/index.ts';
import type { JsonProblem } from '../../../shared/lib/index.ts';

// A regex that doesn't compile, in the browser's words.
export function regexError({ match }: Rule) {
  if (match.mode !== 'regex' || !match.url.trim()) return '';
  try {
    RegExp(match.url.trim()); // throws a SyntaxError if the pattern doesn't compile
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

export function testResult(
  rule: Rule,
  url: string,
): { tone: 'good' | 'bad'; text: string } {
  try {
    const matched = rule.match.url.trim()
      ? testUrl(rule, url)
      : Boolean(rule.match.graphqlOperation.trim());
    if (!matched) return { tone: 'bad', text: 'No match' };
    return {
      tone: 'good',
      text: rule.match.graphqlOperation.trim()
        ? 'URL matches (operation is checked at runtime)'
        : 'Matches',
    };
  } catch (error) {
    return { tone: 'bad', text: (error as Error).message };
  }
}

// What the line under the body says: whether the JSON is valid, or how a script is used. A
// mistake that has a place comes with it (`problem`), for the body editor to mark.
export interface CodeStatus {
  tone?: 'good' | 'bad';
  text: string;
  problem?: JsonProblem;
}

export function codeStatus(rule: Rule, text: string): CodeStatus | null {
  const mode = rule.response.bodyMode;
  if (mode === 'script')
    return {
      text: 'Runs in the page. Return the value the app should receive.',
    };
  if (mode === 'replace' && !/json/i.test(rule.response.contentType)) return null;
  const problem = checkJson(text);
  // An empty body is a mistake with no place to mark.
  if (problem && problem.to <= problem.from)
    return { tone: 'bad', text: problem.message };
  if (problem)
    return {
      tone: 'bad',
      text: `Line ${problem.line}: ${sentenceCase(problem.message)}`,
      problem,
    };
  if (mode === 'merge' && !/^\s*\{/.test(text))
    return {
      tone: 'bad',
      text: 'Merge JSON should be an object, e.g. { "role": "admin" }',
    };
  return { tone: 'good', text: 'Valid JSON' };
}

// "Missing comma after 42" as it reads after "Line 2: ", keeping words like "JSON" whole.
function sentenceCase(message: string) {
  return /^[A-Z][a-z]/.test(message)
    ? message[0]!.toLowerCase() + message.slice(1)
    : message;
}
