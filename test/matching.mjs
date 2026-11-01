// A rule's URL pattern, without a browser: which URLs the page's interceptor answers with it
// (findRule, src/app/interceptor/matching.ts), for each way of comparing a URL, and that the
// rule editor's URL tester (testResult, src/pages/rules/lib/rule-checks.ts) says the same for
// every one of them, so trying a URL in the Match tab tells the truth.
//
//   node test/matching.mjs      (npm test runs it after test/json.mjs)
import { compile, findRule } from '../src/app/interceptor/matching.ts';
import { testResult } from '../src/pages/rules/lib/rule-checks.ts';
import { check, expect, finish } from './fixtures.mjs';

const API = 'https://api.example.test';

// [how the URL is compared, the pattern, a GraphQL operation, the URL tried, whether it matches]
const CASES = [
  ['contains', '/api/users', '', `${API}/api/users?page=2`, true],
  ['contains', '/api/users', '', `${API}/api/user`, false],
  ['contains', '/API/users', '', `${API}/api/users`, false],
  ['contains', '  /api/users  ', '', `${API}/api/users`, true],
  ['equals', `${API}/api/users`, '', `${API}/api/users`, true],
  ['equals', `${API}/api/users`, '', `${API}/api/users?page=2`, false],
  ['equals', '/api/users?page=2', '', `${API}/api/users?page=2`, true],
  ['equals', '/api/users', '', `${API}/api/users?page=2`, false],
  ['equals', 'api/users', '', `${API}/api/users`, false],
  ['wildcard', `${API}/users/*`, '', `${API}/users/42`, true],
  ['wildcard', `${API}/users/*`, '', `${API}/users`, false],
  ['wildcard', '*/users/*', '', `${API}/users/42/posts`, true],
  ['wildcard', `${API}/a.b?c=*`, '', `${API}/a.b?c=1`, true],
  ['wildcard', `${API}/a.b?c=*`, '', `${API}/aXb?c=1`, false],
  ['wildcard', `${API}/users`, '', `${API}/users/42`, false],
  ['regex', '/api/users/\\d+$', '', `${API}/api/users/42`, true],
  ['regex', '/api/users/\\d+$', '', `${API}/api/users/42/posts`, false],
  ['regex', '/API/', '', `${API}/api/users`, false],
  // A pattern that doesn't compile: the page skips the rule, the editor says why.
  ['regex', '(', '', `${API}/api/users`, false],
  // No pattern: nothing, unless the rule names a GraphQL operation, which then decides alone.
  ['contains', '', '', `${API}/graphql`, false],
  ['contains', '', 'GetUser', `${API}/graphql`, true],
  ['equals', '   ', 'GetUser', `${API}/anything`, true],
  ['contains', '/graphql', 'GetUser', `${API}/graphql`, true],
  ['contains', '/graphql', 'GetUser', `${API}/rest`, false],
];

const rule = (mode, url, graphqlOperation) => ({
  id: 'r1',
  name: '',
  enabled: true,
  match: { url, mode, method: 'ANY', graphqlOperation },
  response: {
    bodyMode: 'replace',
    body: '{}',
    status: '',
    delay: 0,
    contentType: 'application/json',
    headers: [],
  },
  createdAt: 0,
  updatedAt: 0,
});

// Whether the page answers `url` with the rule. The request names the rule's operation, if it
// has one, so only the URL decides.
function pageMatches(candidate, url) {
  const state = {
    enabled: true,
    record: false,
    rules: compile([candidate]),
    needsBody: true,
  };
  const operation = candidate.match.graphqlOperation;
  const body = operation ? JSON.stringify({ operationName: operation, query: '' }) : '';
  return findRule(state, { url, method: 'GET', body }) === candidate;
}

await check(
  'the page answers the URLs each way of comparing should, and only those',
  () => {
    const wrong = CASES.filter(
      ([mode, pattern, operation, url, expected]) =>
        pageMatches(rule(mode, pattern, operation), url) !== expected,
    );
    expect(wrong, []);
  },
);

await check("the Match tab's URL tester says what the page does, for every case", () => {
  const disagree = CASES.filter(([mode, pattern, operation, url]) => {
    const candidate = rule(mode, pattern, operation);
    return (testResult(candidate, url).tone === 'good') !== pageMatches(candidate, url);
  });
  expect(disagree, []);
});

await check(
  "the URL tester gives a pattern that doesn't compile the browser's reason",
  () => {
    const result = testResult(rule('regex', '(', ''), `${API}/api/users`);
    expect(result.tone, 'bad');
    if (!/regular expression/i.test(result.text))
      throw new Error(`expected the regex error, got ${JSON.stringify(result.text)}`);
  },
);

finish();
