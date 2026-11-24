// A rule's URL pattern, without a browser: which URLs the page's interceptor answers with it
// (findRule, src/bounded-contexts/interception/matching.ts), for each way of comparing a URL, and
// that the rule editor's URL tester (testResult, src/bounded-contexts/rules/ui/rule-checks.ts)
// says the same for every one of them, so Try a URL in the rule editor tells the truth. And that
// the requests the editor keeps a rule's server's response from, for its Diff (entryTester), are
// the ones the page would answer with the rule: the same URLs, methods and GraphQL operations.
// Then which of two rules answers, and the order with groups, as the editor and the page rebuild
// it from what's stored (layOut, normalizeGroups), and the names a new group gets; when a rule is
// answering (isAnswering, wouldAnswer); what's wrong with one (regexError, bodyProblem); and what
// the page is given of what's stored (pageState): the rules that answer, each as the editor reads
// it, in their order, and the switches, so that whatever shape a rule is stored in, the page
// answers as it will once the editor's next save has rewritten the rule; on a page that isn't a
// secure context too, which has no crypto.randomUUID.
//
//   node test/matching.mjs      (npm test runs it after test/diff.mjs)
import { applyRule } from '../src/bounded-contexts/interception/apply-rule.ts';
import { ruleFields } from '../src/bounded-contexts/interception/log-entries.ts';
import { compile, findRule } from '../src/bounded-contexts/interception/matching.ts';
import { isId } from '../src/bounded-contexts/rules/domain/rule.ts';
import { testResult } from '../src/bounded-contexts/rules/ui/rule-checks.ts';
import {
  bodyProblem,
  createRule,
  entryTester,
  freeName,
  hasJsonBody,
  isAnswering,
  layOut,
  normalizeGroups,
  normalizeRule,
  normalizeRules,
  offGroups,
  pageState,
  regexError,
  ruleTitle,
  wouldAnswer,
} from '../src/bounded-contexts/rules/index.ts';
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

console.log('what the page is given');

await check(
  "the page is given the rules that are on, in no group or a group that's on, in the order, each rebuilt as the editor reads it, keeping its id, and in a group with the group's name, but no rule of a type 0.9.0 took out (a redirect or a block rule) and nothing that isn't a rule; and the two switches as they were stored",
  () => {
    const plain = member('a');
    const stored = {
      enabled: false,
      record: true,
      rules: [
        plain,
        member('b', 'g1'),
        { ...member('c', 'g1'), enabled: false },
        member('d'),
        member('e', 'g2'),
        // As 0.8 stored them: a redirect and a block rule, and a response rule.
        { ...member('f'), type: 'redirect' },
        { ...member('h'), type: 'block' },
        { ...member('i'), type: 'response' },
        member('s', 'gone'),
        null,
        'junk',
        5,
        [],
      ],
      groups: [
        { id: 'g1', name: 'PR-1', at: 1 },
        { id: 'g2', name: 'PR-2', at: 3, enabled: false },
      ],
    };
    const state = pageState(stored);
    const other = pageState({
      enabled: true,
      record: false,
      rules: 'junk',
      groups: null,
    });
    expect(
      [
        state.type,
        [state.enabled, state.record],
        state.rules.map((each) =>
          'groupName' in each ? `${each.id} in ${each.groupName}` : each.id,
        ),
        // Rebuilt: the editor's own rule a copy, field for field, and 0.8's response rule with
        // nothing of 0.8 left.
        [state.rules[0] !== plain, state.rules[0], 'type' in state.rules[3]],
        [other.type, other.enabled, other.record, other.rules],
      ],
      [
        'state',
        [false, true],
        ['a', 'b in PR-1', 'd', 'i', 's'],
        [true, plain, false],
        ['state', true, false, []],
      ],
    );
  },
);

// What the page does with rules as they're stored, through what it's given (pageState) and the
// interceptor's own functions, for each of REQUESTS: no rule, or the one that matches it, with
// what the page gets (applyRule: the status, the headers and the body, and the delay as applyRule
// works it out, noted and not waited for) and what the log says of the rule (ruleFields) but its
// id, which a rule with no valid one gets anew each time it's rebuilt. A rule that keeps the
// server's body is given a response made here.
const REQUESTS = [
  { method: 'GET', url: `${API}/api/user`, body: '' },
  { method: 'POST', url: `${API}/api/user`, body: '{"id":1}' },
  { method: 'PURGE', url: `${API}/api/user`, body: '' },
  { method: 'HEAD', url: `${API}/api/user`, body: '' },
  { method: 'GET', url: `${API}/api/other`, body: '' },
  {
    method: 'POST',
    url: `${API}/graphql`,
    body: JSON.stringify({ operationName: 'GetUser', query: 'query GetUser { me }' }),
  },
];
const realResponse = async () =>
  new Response('{"name":"Real"}', {
    headers: { 'content-type': 'application/json', 'x-real': 'yes' },
  });

async function answer(matched, request) {
  const timer = globalThis.setTimeout;
  let delay = 0;
  globalThis.setTimeout = (done, ms) => {
    delay = ms;
    done();
  };
  let got;
  try {
    const result = await applyRule(matched, request, realResponse);
    got = {
      status: result.status,
      statusText: result.statusText,
      headers: [...result.headers],
      body: result.body,
      server: Boolean(result.server),
      action: result.action,
    };
  } catch (problem) {
    got = { failed: String(problem) };
  } finally {
    globalThis.setTimeout = timer;
  }
  try {
    const { ruleName, groupName } = ruleFields(matched);
    return { ...got, delay, log: { ruleName, groupName } };
  } catch (problem) {
    return { ...got, delay, log: { failed: String(problem) } };
  }
}

async function pageAnswers(rules) {
  const state = pageState({ enabled: true, record: true, rules, groups: [] });
  const page = {
    enabled: true,
    record: true,
    rules: compile(state.rules),
    needsBody: true,
  };
  const answers = [];
  for (const request of REQUESTS) {
    const matched = findRule(page, request);
    answers.push(matched ? await answer(matched, request) : null);
  }
  return answers;
}

// The editor's own rule, as its save writes it, which each odd shape below changes one thing of:
// it answers /api/user, whatever the method, with a body of its own and a header, and no status
// or delay of its own.
const editors = () => ({
  ...createRule(),
  id: 'odd',
  name: 'Odd',
  match: { url: '/api/user', mode: 'contains', method: 'ANY', graphqlOperation: '' },
  response: {
    bodyMode: 'replace',
    body: '{"name":"Mocked"}',
    status: '',
    delay: 0,
    contentType: 'application/json',
    headers: [{ op: 'set', name: 'X-Mock', value: 'yes' }],
  },
});
// The editor's rule with one field, by its path ('match.method'), set to `value`, or left out.
const changed = (path, value) => {
  const stored = editors();
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((object, key) => object[key], stored)[last] = value;
  return stored;
};
const without = (path) => {
  const stored = editors();
  const keys = path.split('.');
  const last = keys.pop();
  delete keys.reduce((object, key) => object[key], stored)[last];
  return stored;
};
const each = (path, values) =>
  values.map((value) => [`${path} ${JSON.stringify(value)}`, changed(path, value)]);
const ROW = { op: 'set', name: 'X-Odd', value: 'yes' };
const naming = (url) => ({
  url,
  mode: 'contains',
  method: 'ANY',
  graphqlOperation: 'GetUser',
});

// The shapes a stored rule can be in that an older version, a hand or a script could leave:
// fields missing or of the wrong type, a method in small letters, a body mode that isn't one, a
// status written oddly or out of range, a delay past the longest a rule keeps, header rows that
// aren't, a type from before 0.9.0, an id that isn't one, and entries that aren't rules at all.
const SHAPES = [
  ["the editor's own", editors()],
  ["the editor's own, naming an operation", changed('match', naming('/graphql'))],
  [
    "the editor's own, keeping the server's body",
    changed('response.bodyMode', 'original'),
  ],
  ...[
    'id',
    'name',
    'enabled',
    'group',
    'match',
    'response',
    'createdAt',
    'updatedAt',
    'match.url',
    'match.mode',
    'match.method',
    'match.graphqlOperation',
    'response.bodyMode',
    'response.body',
    'response.status',
    'response.delay',
    'response.contentType',
    'response.headers',
  ].map((path) => [`no ${path}`, without(path)]),
  ...each('match', ['/api/user', [], null]),
  ...each('match.method', ['get', 'post', 'any', ' GET', '', null, 1, 'PURGE']),
  ...each('match.graphqlOperation', [7, null]),
  ...each('match.url', [42, null]),
  ...[42, null].map((url) => [
    `match.url ${url}, naming an operation`,
    changed('match', naming(url)),
  ]),
  ...each('enabled', [0, null, '', 'false', 1]),
  ...each('response.bodyMode', ['Replace', 'proxy', 1, null, 'merge', 'script']),
  ...each('response.body', [null, 5, { name: 'Mocked' }]),
  ...each('response', ['{"name":"Mocked"}', []]),
  ...each('response.contentType', [
    null,
    5,
    ['text/plain'],
    '',
    'text/plain\r\nX-Odd: yes',
  ]),
  ...each('response.status', [
    ' 404',
    '404 ',
    '0404',
    '404.0',
    '0x194',
    '4.04e2',
    404,
    [404],
    true,
    null,
    '  ',
    '600',
    '199',
    '100',
    '20',
    '1000',
    '204',
    404.5,
  ]),
  ...each('response.headers', [{ 'X-Odd': 'yes' }, 5, 'X-Odd: yes', null]),
  ...each('response.headers', [
    [null],
    [['X-Odd', 'yes']],
    [{ ...ROW, name: 5 }],
    [{ ...ROW, value: 5 }],
    [{ ...ROW, value: true }],
    [{ ...ROW, value: null }],
    [{ ...ROW, op: 'REMOVE' }],
    [{ name: 'X-Odd', value: 'yes' }],
    [{ op: 'set', name: 'X-Odd' }],
    [{ ...ROW, name: '  X-Odd  ' }],
    [{ ...ROW, name: 'Content-Type:' }],
    [{ ...ROW, value: 'a\nb' }],
  ]),
  ...each('response.delay', [
    600_001,
    700_000,
    2_147_483_648,
    'Infinity',
    1.5,
    0.4,
    1e-7,
    600_000,
    -100,
    '500',
    true,
    null,
  ]),
  ...each('name', [5, true, { text: 'Odd' }, null]),
  ['a groupName stored on an ungrouped rule', { ...editors(), groupName: 'Stored' }],
  ...each('id', ['', 'with space', 5, null]),
  ['an id of 65 characters', changed('id', 'x'.repeat(65))],
  ...each('type', ['response', 'redirect', 'headers', 'block', 'Response', null]),
  ...[null, 'junk', 5, []].map((entry) => [`the entry ${JSON.stringify(entry)}`, entry]),
  [
    'only a match and a response, as a hand might write one',
    { match: { url: '/api/user' }, response: { body: '{"name":"Mocked"}' } },
  ],
];

await check(
  "whatever shape a rule is stored in, the page answers as it will once the editor's next save has rewritten the rule: for each request the same rule or none, the same status, headers, body and delay, and the same in the log but the rule's id",
  async () => {
    // The editor's own rule answers /api/user, whatever the method, with its own body, and no
    // other request: what the shapes below are told apart by.
    expect(
      (await pageAnswers([editors()])).map(
        (got) => got && [got.status, got.body, got.action, got.log.ruleName],
      ),
      [
        [200, '{"name":"Mocked"}', 'mocked', 'Odd'],
        [200, '{"name":"Mocked"}', 'mocked', 'Odd'],
        [200, '{"name":"Mocked"}', 'mocked', 'Odd'],
        [200, null, 'mocked', 'Odd'],
        null,
        null,
      ],
      "the editor's own rule",
    );
    const differ = [];
    for (const [shape, stored] of SHAPES) {
      const now = await pageAnswers([structuredClone(stored)]);
      // What the editor reads of the stored rules, which is what its next save writes back.
      const saved = await pageAnswers(normalizeRules([structuredClone(stored)]));
      if (JSON.stringify(now) !== JSON.stringify(saved)) differ.push(shape);
    }
    expect(differ, []);
  },
);

await check(
  "a rule whose name isn't text (a number, true, an object) answers the page, and the log names it as the editor does, by its URL",
  async () => {
    const seen = [];
    for (const name of [5, true, { text: 'Odd' }]) {
      const [got] = await pageAnswers([changed('name', name)]);
      seen.push(got && [got.action, got.body, got.log]);
    }
    expect(
      [ruleTitle(normalizeRule(changed('name', 5))), seen],
      [
        '/api/user',
        Array.from({ length: 3 }, () => [
          'mocked',
          '{"name":"Mocked"}',
          { ruleName: '/api/user', groupName: '' },
        ]),
      ],
    );
  },
);

await check(
  "a rule whose headers aren't a list (an object, a number), or have a row named by a number, answers the page with its own body and none of those headers",
  async () => {
    const seen = [];
    for (const headers of [{ 'X-Odd': 'yes' }, 5, [{ ...ROW, name: 5 }]]) {
      const [got] = await pageAnswers([changed('response.headers', headers)]);
      seen.push(got && [got.failed ?? got.action, got.status, got.headers, got.body]);
    }
    expect(
      seen,
      Array.from({ length: 3 }, () => [
        'mocked',
        200,
        [['content-type', 'application/json']],
        '{"name":"Mocked"}',
      ]),
    );
  },
);

await check(
  "without crypto.randomUUID, as in a content script on a page served over plain http from a host that isn't localhost, the page is still given its rules rebuilt and in their group: a valid id kept as it is, and one that isn't given a version 4 UUID, which isId accepts",
  () => {
    const stored = {
      enabled: true,
      record: true,
      rules: [
        member('kept', 'g1'),
        {
          ...member('x'),
          id: 'not an id',
          match: { ...member('x').match, method: 'get' },
        },
      ],
      groups: [{ id: 'g1', name: 'PR-1', at: 0 }],
    };
    // A secure context's own function, which such a page's scripts don't have.
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    let absent;
    let state;
    try {
      absent = typeof crypto.randomUUID;
      state = pageState(stored);
    } finally {
      delete crypto.randomUUID;
    }
    const made = state.rules[1].id;
    expect(
      [
        [absent, typeof crypto.randomUUID],
        state.rules.map((given) => [given.groupName ?? '', given.match.method]),
        state.rules[0].id,
        isId(made),
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(made),
      ],
      [
        ['undefined', 'function'],
        [
          ['PR-1', 'ANY'],
          ['', 'ANY'],
        ],
        'kept',
        true,
        true,
      ],
    );
  },
);

finish();
