// A rule's URL pattern, without a browser: which URLs the page's interceptor answers with it
// (findRule, src/app/interceptor/matching.ts), for each way of comparing a URL, and that the
// rule editor's URL tester (testResult, src/pages/rules/lib/rule-checks.ts) says the same for
// every one of them, so Try a URL in the rule editor tells the truth. And that the requests the
// editor keeps a rule's server's response from, for its Diff (entryTester), are the ones the page
// would answer with the rule: the same URLs, methods and GraphQL operations. Then which of two
// rules answers, and the order with groups, as the editor and the page rebuild it from what's
// stored (layOut, normalizeGroups), and the names a new group gets; when a rule is answering
// (isAnswering, wouldAnswer); and what's wrong with one (regexError, bodyProblem).
//
//   node test/matching.mjs      (npm test runs it after test/diff.mjs)
import { compile, findRule } from '../src/app/interceptor/matching.ts';
import { testResult } from '../src/pages/rules/lib/rule-checks.ts';
import {
  bodyProblem,
  createRule,
  entryTester,
  freeName,
  hasJsonBody,
  isAnswering,
  layOut,
  normalizeGroups,
  offGroups,
  regexError,
  wouldAnswer,
} from '../src/shared/api/index.ts';
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

await check('Try a URL says what the page does, for every case', () => {
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

await check(
  "the Diff keeps the server's response from the requests the page would answer with the rule, for every case, method and way of naming a GraphQL operation",
  () => {
    const BODIES = [
      '',
      JSON.stringify({ operationName: 'GetUser', query: '' }),
      JSON.stringify({ query: 'query GetUser { me }' }),
      JSON.stringify([{ operationName: 'GetUser' }]),
      JSON.stringify({ operationName: 'Other', query: '' }),
      // A name that isn't text is still the body's say: the URL's operationName isn't asked.
      JSON.stringify({ operationName: 7, query: '' }),
      'not json',
    ];
    const disagree = [];
    let tried = 0;
    for (const [mode, pattern, operation, url] of CASES)
      for (const ruleMethod of ['ANY', 'GET', 'POST'])
        for (const method of ['GET', 'POST'])
          for (const body of BODIES)
            for (const query of ['', 'operationName=GetUser']) {
              const candidate = rule(mode, pattern, operation);
              candidate.match.method = ruleMethod;
              const target = query
                ? `${url}${url.includes('?') ? '&' : '?'}${query}`
                : url;
              const state = { enabled: true, record: false, rules: compile([candidate]) };
              const page = findRule(state, { url: target, method, body }) === candidate;
              const kept = entryTester(candidate)({
                method,
                url: target,
                requestBody: body,
              });
              tried++;
              if (page !== kept)
                disagree.push([
                  mode,
                  pattern,
                  operation,
                  ruleMethod,
                  method,
                  body,
                  target,
                ]);
            }
    expect([disagree.slice(0, 5), tried > 1000], [[], true]);
  },
);

console.log('the order, and groups');
// A rule with an id and a group, matching /api/user.
const member = (id, group = '') => ({
  ...createRule(),
  id,
  group,
  match: { url: '/api/user', mode: 'contains', method: 'ANY', graphqlOperation: '' },
});

await check('of two rules that match a request, the one tried first answers', () => {
  const [first, second] = [member('first'), member('second')];
  const state = {
    enabled: true,
    record: false,
    rules: compile([first, second]),
    needsBody: false,
  };
  const request = (url) => findRule(state, { url, method: 'GET', body: '' })?.id;
  expect([request(`${API}/api/user`), request(`${API}/api/other`)], ['first', undefined]);
});

await check(
  "the order from what's stored: each group in its place among the top-level entries with its rules in their order, the ungrouped rules filling the rest in theirs, a rule whose group isn't there ungrouped, and a group with no place last",
  () => {
    const groups = normalizeGroups([
      { id: 'g1', name: 'PR-1', at: 1 },
      { id: 'g2', name: 'PR-2', at: 3 },
      { id: 'g3', name: 'Empty' },
    ]);
    const rules = [
      member('a'),
      member('b', 'g1'),
      member('c'),
      member('d', 'g2'),
      member('e', 'gone'),
      member('f', 'g1'),
    ];
    const entries = layOut(rules, groups);
    expect(
      [
        entries.map((entry) =>
          entry.kind === 'rule'
            ? entry.rule.id
            : `${entry.group.name}: ${entry.rules.map((each) => each.id).join(' ')}`,
        ),
        rules.find((each) => each.id === 'e').group,
      ],
      [['a', 'PR-1: b f', 'c', 'PR-2: d', 'e', 'Empty: '], ''],
    );
  },
);

await check(
  "stored groups are rebuilt: one without an id, or with another's, is left out; a name another has gets a number, ignoring case, an empty one is New group; a group is on unless it says it's off",
  () => {
    const groups = normalizeGroups([
      { id: 'x', name: 'PR-1' },
      { id: 'x', name: 'Again' },
      { name: 'No id' },
      { id: 'y', name: 'pr-1' },
      { id: 'z', name: '  \n ', enabled: false },
      'junk',
      null,
    ]);
    expect(
      [
        groups.map((group) => [group.id, group.name, group.enabled]),
        [...offGroups([{ id: 'g1', enabled: false }, { id: 'g2' }, { enabled: false }])],
      ],
      [
        [
          ['x', 'PR-1', true],
          ['y', 'pr-1 (2)', true],
          ['z', 'New group', false],
        ],
        ['g1'],
      ],
    );
  },
);

await check(
  'a new group or a copy takes the first name no group has, and an import the next number in brackets',
  () => {
    const taken = [{ name: 'New group' }, { name: 'new group 2' }, { name: 'PR-1' }];
    expect(
      [
        freeName('New group', taken),
        freeName('PR-1 copy', taken),
        freeName('PR-1', taken, 'brackets'),
      ],
      ['New group 3', 'PR-1 copy', 'PR-1 (2)'],
    );
  },
);

await check(
  "a rule is answering while it's on, its group is on and Ghostfetch isn't paused; one that would answer needs only the first two",
  () => {
    const on = { enabled: true };
    const off = { enabled: false };
    expect(
      [
        isAnswering(on, true, false),
        isAnswering(on, false, false),
        isAnswering(on, true, true),
        isAnswering(off, true, false),
        wouldAnswer(on, true),
        wouldAnswer(on, false),
        wouldAnswer(off, true),
      ],
      [true, false, false, false, true, false, false],
    );
  },
);

await check(
  "what's wrong with a rule: a regex that doesn't compile, and a mistake in a JSON body of its own, and in no other body",
  () => {
    const broken = rule('regex', '(', '');
    broken.response.body = '{ "a": 1, }';
    // Keeps the server's body: its own isn't sent, so it isn't checked.
    const kept = rule('contains', '(', '');
    kept.response.body = '{ "a": 1, }';
    kept.response.bodyMode = 'original';
    const text = rule('contains', '/api', '');
    text.response.body = 'not json';
    text.response.contentType = 'text/plain';
    expect(
      [
        Boolean(regexError(broken)),
        regexError(kept),
        regexError(rule('regex', '   ', '')),
        [hasJsonBody(broken), Boolean(bodyProblem(broken))],
        [hasJsonBody(kept), Boolean(bodyProblem(kept))],
        [hasJsonBody(text), Boolean(bodyProblem(text))],
        Boolean(bodyProblem(rule('contains', '/api', ''))),
      ],
      [true, '', '', [true, true], [false, false], [false, false], false],
    );
  },
);

finish();
