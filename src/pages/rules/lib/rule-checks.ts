// What the rule editor says about what you typed: a regex that doesn't compile, whether a URL
// matches the pattern, and whether a body is valid JSON.
import { testUrl } from '../../../entities/rule/index.ts';
import type { Rule } from '../../../entities/rule/index.ts';
import { jsonProblem } from '../../../shared/lib/json/index.ts';

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

// What the line under the body says: whether the JSON is valid, or how a script is used.
export function codeStatus(
  rule: Rule,
  text: string,
): { tone?: 'good' | 'bad'; text: string } | null {
  const mode = rule.response.bodyMode;
  if (mode === 'script')
    return {
      text: 'Runs in the page. Return the value the app should receive.',
    };
  if (mode === 'replace' && !/json/i.test(rule.response.contentType)) return null;
  let problem = jsonProblem(text);
  if (!problem && mode === 'merge' && !/^\s*\{/.test(text))
    problem = 'Merge JSON should be an object, e.g. { "role": "admin" }';
  return { tone: problem ? 'bad' : 'good', text: problem || 'Valid JSON' };
}
