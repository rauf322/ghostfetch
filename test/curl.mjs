// cURL commands both ways, without a browser. Traffic's Copy as cURL: the command for a request,
// and that nothing the page put in the request can make a shell run anything but curl when the
// command is pasted. New rule: what it reads from a command (as the browsers' Copy as cURL writes
// one, or as people type one), from a URL or from "GET /path", and the rule it makes.
//
//   node test/curl.mjs      (npm test runs it after test/matching.mjs)
import { execFileSync } from 'node:child_process';
import {
  NEW_DRAFT,
  readTyped,
  ruleFromDraft,
} from '../src/pages/rules/lib/rule-draft.ts';
import { curlCommand, parseCurl } from '../src/shared/lib/curl.ts';
import { check, expect, finish } from './fixtures.mjs';

const URL = 'https://api.example.test/api/users?page=2';

await check('a GET is the URL alone, in quotes', () => {
  expect(curlCommand({ method: 'GET', url: URL }), `curl '${URL}'`);
});

await check('a POST with a JSON body: the body and its Content-Type, no -X', () => {
  expect(
    curlCommand({ method: 'post', url: URL, body: '{"name":"Ada"}' }),
    `curl '${URL}' -H 'content-type: application/json' --data-raw '{"name":"Ada"}'`,
  );
});

await check('another method with a body, or without one, says so with -X', () => {
  expect(
    [
      curlCommand({ method: 'PUT', url: URL, body: 'name=Ada' }),
      curlCommand({ method: 'DELETE', url: URL }),
      curlCommand({ method: 'POST', url: URL }),
    ],
    [
      `curl '${URL}' -X PUT --data-raw 'name=Ada'`,
      `curl '${URL}' -X DELETE`,
      `curl '${URL}' -X POST`,
    ],
  );
});

// What a shell makes of the command: the words it hands curl. `printf` stands in for curl, so
// nothing goes over the network; a word the page slipped out of its quotes would show up as an
// extra word, or run.
const words = (command) =>
  execFileSync('/bin/sh', ['-c', `printf '%s\\n' ${command.replace(/^curl /, '')}`], {
    encoding: 'utf8',
  })
    .split('\n')
    .slice(0, -1);

await check(
  "a page's quotes, $(…), backticks and ; stay inside the words they're in",
  () => {
    const url = `${URL}&q=it's'$(touch /tmp/gf-pwned)\`id\`;rm -rf ~`;
    const body = `{"a":"'; echo pwned; '"}`;
    const method = 'GET; echo pwned';
    expect(words(curlCommand({ method, url, body })), [
      url,
      '-X',
      'GET; ECHO PWNED',
      '-H',
      'content-type: application/json',
      '--data-raw',
      body,
    ]);
  },
);

await check(
  "a URL that starts with a dash is named with --url, so curl can't take it for an option",
  () => {
    const command = curlCommand({ method: 'GET', url: '-o/tmp/gf-pwned' });
    expect(
      [command, words(command)],
      ["curl --url '-o/tmp/gf-pwned'", ['--url', '-o/tmp/gf-pwned']],
    );
  },
);

await check("a ' at the very start or end of a body stays in it", () => {
  const body = "'quoted'";
  expect(words(curlCommand({ method: 'POST', url: URL, body })), [
    URL,
    '--data-raw',
    body,
  ]);
});

console.log('reading a command');

await check("Chrome's Copy as cURL (bash), over several lines", () => {
  const command = [
    `curl '${URL}' \\`,
    "  -H 'accept: application/json, text/plain, */*' \\",
    "  -H 'accept-language: en-GB,en;q=0.9' \\",
    "  -H 'user-agent: Mozilla/5.0 (Macintosh)' \\",
    '  --compressed',
  ].join('\n');
  expect(parseCurl(command), {
    url: URL,
    method: 'GET',
    headers: [
      ['accept', 'application/json, text/plain, */*'],
      ['accept-language', 'en-GB,en;q=0.9'],
      ['user-agent', 'Mozilla/5.0 (Macintosh)'],
    ],
    body: '',
  });
});

await check("a body in $'…' with escapes, which makes it a POST", () => {
  const parsed = parseCurl(
    `curl '${URL}' -H 'content-type: application/json' --data-raw $'{"name":"it\\'s","note":"a\\nb"}'`,
  );
  expect([parsed.method, parsed.body], ['POST', `{"name":"it's","note":"a\nb"}`]);
});

await check('-X, "double quotes", -G, -I, --url, and options that take a value', () => {
  expect(
    [
      parseCurl(`curl -X PATCH "${URL}" -d "a=\\"1\\""`),
      parseCurl(`curl -G --data-urlencode q=ada -A 'agent' ${URL}`),
      parseCurl(`curl -I -u ada:secret --url ${URL}`),
      parseCurl(`curl -XDELETE ${URL}`),
    ].map((parsed) => [parsed.url, parsed.method, parsed.body]),
    [
      [URL, 'PATCH', 'a="1"'],
      [URL, 'GET', 'q=ada'],
      [URL, 'HEAD', ''],
      [URL, 'DELETE', ''],
    ],
  );
});

await check("Chrome's $'…' escapes: \\u for ! and control characters, \\x, octal", () => {
  const parsed = parseCurl(
    `curl '${URL}' --data-raw $'{"msg":"Hi\\u0021\\x41\\101\\t"}'`,
  );
  expect(parsed.body, '{"msg":"Hi!AA\t"}');
});

await check(
  "an escape for a character there isn't (past U+10FFFF) is read as the replacement character",
  () => {
    // Up to 0.20.1 it threw, and New rule reads what's typed with every key: such a command
    // pasted there didn't land at all.
    const parsed = parseCurl(`curl '${URL}' --data-raw $'a\\U00110000b\\U0001F600c'`);
    expect([parsed.url, parsed.body], [URL, 'a�b😀c']);
    expect(parseCurl("$'\\UFFFFFFFF'"), null, 'not a curl command, and not an error');
  },
);

await check(
  'options that take a value before the URL, known to the parser or not',
  () => {
    expect(
      [
        parseCurl(`curl --retry 3 --max-redirs 5 -U ada:pw ${URL}`),
        parseCurl(`curl --made-up thing ${URL}`),
      ].map((parsed) => parsed.url),
      [URL, URL],
    );
  },
);

await check('not a curl command, or one with no URL: nothing', () => {
  expect(
    [parseCurl('wget https://example.test'), parseCurl('curl -H "a: b"')],
    [null, null],
  );
});

await check(
  'what Copy as cURL writes reads back as the same request, page tricks and all',
  () => {
    const requests = [
      { method: 'GET', url: URL, body: '' },
      {
        method: 'POST',
        url: `${URL}&q=it's'$(id)\`id\`;x`,
        body: `{"a":"'; echo pwned; '"}`,
      },
      { method: 'PUT', url: URL, body: "line one\nline 'two'" },
      { method: 'GET', url: '-o/tmp/gf-pwned', body: '' },
    ];
    expect(
      requests.map((request) => {
        const parsed = parseCurl(curlCommand(request));
        return { method: parsed.method, url: parsed.url, body: parsed.body };
      }),
      requests,
    );
  },
);

console.log("New rule's input");

await check(
  'a full URL becomes its path and query, so the rule answers on any host',
  () => {
    expect(
      [
        readTyped(`  ${URL}  `),
        readTyped('/api/users'),
        readTyped('api.example.test/users'),
        readTyped('ftp://files.example.test/a'),
      ].map((typed) => [typed.url, typed.method]),
      [
        ['/api/users?page=2', null],
        ['/api/users', null],
        ['api.example.test/users', null],
        ['ftp://files.example.test/a', null],
      ],
    );
  },
);

await check(
  'a bare origin keeps its host: its path alone, "/", would match every URL',
  () => {
    expect(
      [
        readTyped('https://api.example.test'),
        readTyped('https://api.example.test:8080/'),
        readTyped('https://api.example.test/?x=1'),
      ].map((typed) => typed.url),
      ['api.example.test/', 'api.example.test:8080/', '/?x=1'],
    );
  },
);

await check(
  "a command's Accept becomes the Content-Type only when it's a media type and nothing else",
  () => {
    expect(
      [
        readTyped(`curl '${URL}' -H 'accept: text/plain; charset=utf-8'`),
        readTyped(`curl '${URL}' -H 'accept: plain'`),
        readTyped(`curl '${URL}' -H 'accept: text/plain\u0000'`),
      ].map((typed) => typed.contentType),
      ['text/plain', '', ''],
    );
  },
);

await check(
  '"POST /api/users" names the method; "Any" or a word that isn\'t one doesn\'t',
  () => {
    expect(
      [
        readTyped('post /api/users'),
        readTyped('any /api/users'),
        readTyped('users /api'),
      ].map((typed) => [typed.url, typed.method]),
      [
        ['/api/users', 'POST'],
        ['any /api/users', null],
        ['users /api', null],
      ],
    );
  },
);

await check("a command's method, Accept and GraphQL operation", () => {
  const graphql = JSON.stringify({
    operationName: 'GetUser',
    query: 'query GetUser { id }',
  });
  expect(
    [
      readTyped(`curl '${URL}' -H 'Accept: text/csv; q=1'`),
      readTyped(`curl '${URL}' -H 'accept: */*'`),
      readTyped(`curl https://api.example.test/graphql --data-raw '${graphql}'`),
    ],
    [
      {
        url: '/api/users?page=2',
        method: 'GET',
        graphqlOperation: '',
        contentType: 'text/csv',
      },
      { url: '/api/users?page=2', method: 'GET', graphqlOperation: '', contentType: '' },
      { url: '/graphql', method: 'POST', graphqlOperation: 'GetUser', contentType: '' },
    ],
  );
});

await check(
  'the rule: the request from what was typed, the answer from the draft',
  () => {
    const rule = ruleFromDraft(`curl '${URL}' -X POST -H 'accept: text/plain'`, {
      ...NEW_DRAFT,
      method: 'POST',
      mode: 'equals',
      status: '404',
      delay: 250,
      body: '{"error": "Not Found"}',
    });
    expect(
      [rule.match, rule.response.status, rule.response.delay, rule.response.contentType],
      [
        {
          url: '/api/users?page=2',
          mode: 'equals',
          method: 'POST',
          graphqlOperation: '',
        },
        '404',
        250,
        'text/plain',
      ],
    );
  },
);

finish();
