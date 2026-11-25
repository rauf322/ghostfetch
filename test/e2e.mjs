// End-to-end check: loads the built extension (.output/chrome-mv3) into Chromium via
// Playwright, serves a small local API and verifies every rule type, the traffic log and the
// editor.
//
//   npm install && npm run browsers    (once: playwright-core and its Chromium)
//   npm test                           (builds, then runs this)
//
// Branded Google Chrome ignores --load-extension. To use another build such as Chrome for
// Testing, set CHROME=/path/to/binary. PLAYWRIGHT=/path/to/playwright-core overrides the
// library. Set HEADED=1 to watch it, SHOTS=dir to save screenshots of the UI.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { headerProblem } from '../src/shared-kernel/index.ts';
import { createGroup, createRule } from '../src/bounded-contexts/rules/index.ts';
import {
  isSiteEnabled,
  normalizeSites,
  siteMatchPatterns,
} from '../src/bounded-contexts/sites/index.ts';
import { curlCommand, diffLines, formatJson } from '../src/lib/index.ts';
import {
  CHROME_BUILD,
  VIM_START,
  VIM_STEPS,
  WRAP_BODY,
  WRAP_TOKENS,
  check,
  expect,
  finish,
  itemsBody,
  narrowEditor,
  requireBuild,
  rowsAgree,
  sleep,
  startServer,
  testRules,
  vimKeys,
  wrapBreaks,
  wrapLayout,
  wrapRoom,
} from './fixtures.mjs';

const EXTENSION = requireBuild(CHROME_BUILD);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const SHOTS = process.env.SHOTS;
const { server, ORIGIN, EVIL_ORIGIN, LOCAL_ORIGIN } = await startServer();
const RULES = testRules(ORIGIN);

console.log('sites (unit)');
await check(
  'built-in hosts are always on; added sites cover subdomains, IPs only themselves',
  async () => {
    const sites = ['example.com', '10.0.0.5'];
    const cases = {
      'http://localhost:3000/a': true,
      'https://app.localhost/': true,
      'http://127.0.0.1:8080': true,
      'http://local.myapp.com:3000/': true,
      'https://local.api.example.org/x': true,
      'https://example.com/a': true,
      'http://api.example.com': true,
      'http://10.0.0.5:8080/': true,
      'https://badexample.com': false,
      'http://10.0.0.50': false,
      'http://127.0.0.10': false,
      'http://localhost.evil.com/': false,
      'http://evil.com/localhost': false,
      'http://notlocalhost/': false,
      'http://127.0.0.1.evil.com/': false,
      'http://my.local.com/': false,
      'http://localfoo.com/': false,
      'http://local/': false,
      'http://local./': false,
      'http://local.myapp.com@evil.com/': false,
      'file:///etc/hosts': false,
      'about:blank': false,
      '': false,
    };
    const wrong = Object.entries(cases)
      .filter(([url, enabled]) => isSiteEnabled(sites, url) !== enabled)
      .map(([url]) => url);
    expect(wrong, []);
    expect(siteMatchPatterns(sites), ['*://*.example.com/*', '*://10.0.0.5/*']);
  },
);
await check(
  'added sites are reduced to hostnames and IP addresses, without duplicates or built-in hosts',
  async () => {
    expect(
      normalizeSites([
        'https://Staging.Example.com:8080/app?x=1',
        '*.example.com',
        'staging.example.com',
        'localhost:3000',
        '127.0.0.1',
        'local.myapp.com',
        'http://My_App.test:3000/x',
        '<img src=x>',
        'http://[::1]:5173/',
        '[::1]',
        'javascript:alert(1)',
        '',
      ]),
      ['staging.example.com', 'example.com', 'my_app.test', '[::1]'],
    );
  },
);
await check(
  'a host with an underscore and an IPv6 address are sites like any other: patterns Chrome takes, the address only itself',
  async () => {
    // Up to 0.20.1 neither could be added, though Chrome runs content scripts on both.
    const sites = ['my_app.test', '[::1]'];
    expect(siteMatchPatterns(sites), ['*://*.my_app.test/*', '*://[::1]/*']);
    expect(
      [
        'http://my_app.test:3000/',
        'http://api.my_app.test/',
        'http://[::1]:5173/x',
        'http://[::2]/',
        'http://my_app.test.evil.com/',
      ].map((url) => isSiteEnabled(sites, url)),
      [true, true, true, false, false],
    );
  },
);
await check('the manifest only injects content scripts on those same hosts', async () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'),
  );
  const entries = manifest.content_scripts.map(
    ({ js, matches, include_globs = [], exclude_matches = [] }) => [
      js.join(),
      matches.join(' '),
      include_globs.join(' '),
      exclude_matches.join(' '),
    ],
  );
  const localhost = '*://localhost/* *://*.localhost/* *://127.0.0.1/*';
  const local = ['*://*/*', 'http://local.* https://local.*', '*://*.localhost/*'];
  expect(entries, [
    ['interceptor.js', localhost, '', ''],
    ['bridge.js', localhost, '', ''],
    ['interceptor.js', ...local],
    ['bridge.js', ...local],
  ]);
});

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-e2e-'));
// Without CHROME, use the Chromium that `npm run browsers` installs. channel "chromium"
// selects its new headless mode, which (unlike the headless shell) supports extensions.
const context = await chromium.launchPersistentContext(userDataDir, {
  ...(process.env.CHROME
    ? { executablePath: process.env.CHROME }
    : { channel: 'chromium' }),
  headless: !process.env.HEADED,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    // A non-localhost, a local.* hostname and one with an underscore that still reach the test
    // server.
    '--host-resolver-rules=MAP evil.test 127.0.0.1,MAP local.ghostfetch.test 127.0.0.1,MAP my_app.test 127.0.0.1',
  ],
  viewport: { width: 1280, height: 820 },
});
const errors = [];
context.on('weberror', (error) => errors.push(`weberror: ${error.error().message}`));

try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  const extensionId = new URL(worker.url()).host;
  console.log(`Extension ${extensionId}, test server ${ORIGIN}\n`);
  // Extension APIs are bound a moment after the worker starts.
  for (
    let attempt = 0;
    attempt < 50 && !(await worker.evaluate(() => Boolean(globalThis.chrome?.storage)));
    attempt++
  ) {
    await sleep(100);
  }
  const setStorage = (values) =>
    worker.evaluate((v) => chrome.storage.local.set(v), values);
  await setStorage({ enabled: true, record: true, rules: RULES });
  await sleep(500);

  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  await page.goto(ORIGIN);

  const call = (url, init) =>
    page.evaluate(
      async ([target, options]) => {
        const started = performance.now();
        try {
          const response = await fetch(target, options);
          const text = await response.text();
          let body;
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
          return {
            status: response.status,
            body,
            headers: Object.fromEntries(response.headers),
            ms: performance.now() - started,
            url: response.url,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
      [url, init],
    );

  const xhr = (url, { method = 'GET', responseType = '', body = null } = {}) =>
    page.evaluate(
      ([target, verb, type, payload]) =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest();
          const states = [];
          let loadFired = false;
          request.open(verb, target);
          request.responseType = type;
          // Apps listen both ways, so a mocked request has to fire both: the on… handlers
          // here, addEventListener() for load.
          // oxlint-disable-next-line unicorn/prefer-add-event-listener
          request.onreadystatechange = () => states.push(request.readyState);
          request.addEventListener('load', () => {
            loadFired = true;
          });
          // oxlint-disable-next-line unicorn/prefer-add-event-listener
          request.onloadend = () =>
            resolve({
              status: request.status,
              statusText: request.statusText,
              response: request.response,
              text: type === '' ? request.responseText : null,
              mockHeader: request.getResponseHeader('x-mock'),
              allHeaders: request.getAllResponseHeaders(),
              url: request.responseURL,
              states,
              loadFired,
            });
          request.send(payload);
        }),
      [url, method, responseType, body],
    );

  console.log('fetch()');
  await check('request fired by the page during load is mocked', async () => {
    expect(await page.evaluate(() => window.early), { early: 'mocked' });
  });
  await check('replace: body, status and custom header', async () => {
    const r = await call('/api/user?case=replace');
    expect(
      [r.status, r.body, r.headers['x-mock'], r.headers['content-type']],
      [404, { name: 'Mocked' }, 'yes', 'application/json'],
    );
  });
  await check(
    "a Merge rule saved by 0.7 keeps the server's body and headers, its JSON unused",
    async () => {
      const r = await call('/api/user?case=merge');
      expect(r.body, {
        id: 1,
        name: 'Real',
        role: 'user',
        profile: { city: 'Riga', age: 30 },
        tags: ['a', 'b'],
      });
      expect(r.headers['x-real'], 'yes', 'real header');
    },
  );
  await check("a Script rule saved by 0.7 runs nothing: the server's body", async () => {
    const r = await call('/api/user?case=script');
    expect([r.body.name, 'sawUrl' in r.body], ['Real', false]);
  });
  await check(
    "server's body that can't be fetched: the page gets the network error",
    async () => {
      const r = await call('http://127.0.0.1:1/api/user');
      if (!/TypeError/.test(r.error)) throw new Error(`got ${JSON.stringify(r)}`);
    },
  );
  await check("server's body + delay + status override", async () => {
    const r = await call('/api/user?case=delay');
    expect([r.status, r.body.name], [503, 'Real']);
    if (r.ms < 580) throw new Error(`only took ${Math.round(r.ms)} ms`);
  });
  await check(
    'a page counts for the popup what each rule did on it, by rule and by what it did, with when each last did, and nothing of the requests',
    async () => {
      const tab = (await worker.evaluate(() => chrome.tabs.query({}))).find((candidate) =>
        candidate.url?.startsWith(ORIGIN),
      );
      const ask = () =>
        worker.evaluate(
          (id) =>
            chrome.tabs.sendMessage(id, { type: 'ghostfetch:counts' }, { frameId: 0 }),
          tab.id,
        );
      const ruleId = (url) => RULES.find((rule) => rule.match.url === url).id;
      const [replace, merge, unreachable] = [
        '/api/user?case=replace',
        'case=merge',
        '127.0.0.1:1/',
      ].map(ruleId);
      const before = await ask();
      await call('/api/user?case=replace');
      await call('/api/user?case=replace');
      await call('/api/user?case=merge');
      await call('http://127.0.0.1:1/api/user');
      await sleep(500);
      const after = await ask();
      const more = (id, key) =>
        (after.rules[id]?.[key] ?? 0) - (before.rules[id]?.[key] ?? 0);
      // When each rule counted last answered: a time, and nothing else, for each of them.
      const times = Object.entries(after.last);
      expect(
        [
          after.record,
          Object.keys(after).toSorted(),
          Object.keys(after.rules[replace]).toSorted(),
          [more(replace, 'mocked'), more(merge, 'modified'), more(unreachable, 'failed')],
          times.map(([id]) => id).toSorted(),
          times.every(([, time]) => Number.isInteger(time) && time > 0),
        ],
        [
          true,
          ['last', 'record', 'rules'],
          ['failed', 'mocked', 'modified'],
          [2, 1, 1],
          Object.keys(after.rules).toSorted(),
          true,
        ],
      );
    },
  );
  // A rule that keeps the server's body and sets nothing else, and one that sets a header too.
  const KEEPS = ['case=keep', 'case=kept-header'];
  await check(
    "server's body: bytes that aren't text reach the page as the server sent them",
    async () => {
      // Up to 0.20.1 the body went through text on its way, which bytes like these don't survive:
      // an image or a download came out twice as long, U+FFFD in place of every byte over 127.
      const read = (query) =>
        page.evaluate(async (q) => {
          const response = await fetch(`/api/bytes?${q}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          return [bytes.length, bytes[128], bytes[255], bytes[2047]];
        }, query);
      const sent = [2048, 128, 255, 255];
      expect(
        [await read('case=none'), await read(KEEPS[0]), await read(KEEPS[1])],
        [sent, sent, sent],
      );
    },
  );
  await check(
    "server's body: a response that arrives over time is read as it arrives",
    async () => {
      // Up to 0.20.1 the page got nothing until the server had sent everything (/api/slow takes
      // 600 ms over it), and so never anything of a stream that doesn't end.
      for (const query of KEEPS) {
        const r = await page.evaluate(async (q) => {
          const started = performance.now();
          const response = await fetch(`/api/slow?${q}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let text = decoder.decode((await reader.read()).value, { stream: true });
          const first = performance.now() - started;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
          }
          return {
            first,
            whole: performance.now() - started,
            text,
            kept: response.headers.get('x-kept'),
          };
        }, query);
        if (r.first > 400 || r.whole < 550)
          throw new Error(
            `${query}: first bytes after ${Math.round(r.first)} ms of ${Math.round(r.whole)}`,
          );
        expect(
          [r.text, r.kept],
          ['first\nlast\n', query === KEEPS[1] ? 'yes' : null],
          query,
        );
      }
    },
  );
  await check(
    "server's body: a no-cors request to another origin still gets its opaque response",
    async () => {
      // Up to 0.20.1 the page's fetch() was rejected: an opaque response's status is 0, which a
      // new response can't be made with.
      const other = ORIGIN.replace('127.0.0.1', 'localhost');
      const shapes = await page.evaluate(
        ([origin, queries]) =>
          Promise.all(
            queries.map((query) =>
              fetch(`${origin}/api/user?${query}`, { mode: 'no-cors' }).then(
                (response) => `${response.type} ${response.status}`,
                (error) => String(error),
              ),
            ),
          ),
        [other, ['case=none', ...KEEPS]],
      );
      expect(shapes, ['opaque 0', 'opaque 0', 'opaque 0']);
    },
  );
  await check(
    "server's body: the response's type and final URL are the server's, with a header set too",
    async () => {
      const seen = (query) =>
        page.evaluate(async (q) => {
          const response = await fetch(`/api/user?${q}`);
          return [response.type, response.redirected, new URL(response.url).pathname];
        }, query);
      const real = await seen('case=none');
      expect([await seen(KEEPS[0]), await seen(KEEPS[1])], [real, real]);
    },
  );
  await check('GraphQL operation matching', async () => {
    const post = (operationName) =>
      call('/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operationName, query: `query ${operationName} { x }` }),
      });
    expect((await post('GetUser')).body, { data: { user: 'mocked' } });
    expect((await post('Other')).body, { data: { real: true } });
  });
  await check('GraphQL operation is read from a Request object body', async () => {
    const body = await page.evaluate(async () => {
      const request = new Request('/graphql', {
        method: 'POST',
        body: JSON.stringify({ query: 'query GetUser { x }' }),
      });
      return (await fetch(request)).json();
    });
    expect(body, { data: { user: 'mocked' } });
  });
  await check('method filter (POST only)', async () => {
    expect((await call('/api/user?case=method')).body.name, 'Real');
    expect((await call('/api/user?case=method', { method: 'POST' })).body, {
      post: 'mocked',
    });
  });
  await check('wildcard and regex URL modes', async () => {
    expect((await call('/api/user?case=wild-anything')).body, { wild: true });
    expect((await call('/api/user?case=regex42')).body, { regex: true });
    expect((await call('/api/user?case=regex42x')).body.name, 'Real');
  });
  await check('disabled rule is ignored', async () => {
    expect((await call('/api/user?case=disabled')).body.name, 'Real');
  });
  await check(
    'a fetch the page aborts before it is answered is rejected, by a rule as by the server',
    async () => {
      // Up to 0.20.1 a Replace rule with no delay answered a request whose signal was aborted
      // already. React's StrictMode does that to every effect in development: it runs the effect,
      // its cleanup (which aborts) and the effect again, so each mocked request was answered twice.
      const attempt = (start) =>
        page.evaluate(async (target) => {
          const outcomes = [];
          for (const when of ['before', 'right after']) {
            const controller = new AbortController();
            if (when === 'before') controller.abort();
            const pending = fetch(`${target}aborted=${when[0]}`, {
              signal: controller.signal,
            }).then(
              (response) => `answered ${response.status}`,
              (error) => error.name,
            );
            controller.abort();
            outcomes.push(await pending);
          }
          return outcomes;
        }, start);
      // The server's own, then a rule's: /api/early is answered by the first rule.
      expect(
        [await attempt('/api/user?case=none&'), await attempt('/api/early?')],
        [
          ['AbortError', 'AbortError'],
          ['AbortError', 'AbortError'],
        ],
      );
      expect((await call('/api/early?aborted=no')).body, { early: 'mocked' }, 'the rule');
    },
  );
  await check('a rule answers HEAD with no body, as a server does', async () => {
    // Up to 0.20.1 a Replace rule sent its body in answer to a HEAD request too.
    const head = (target) =>
      page.evaluate(async (address) => {
        const response = await fetch(address, { method: 'HEAD' });
        const overXhr = await new Promise((resolve) => {
          const request = new XMLHttpRequest();
          request.open('HEAD', address);
          request.addEventListener('loadend', () =>
            resolve([request.status, request.responseText]),
          );
          request.send();
        });
        return [
          response.status,
          response.headers.get('content-type'),
          await response.text(),
          overXhr,
        ];
      }, target);
    const bare = [200, 'application/json', '', [200, '']];
    // The server's own, then a rule's: /api/early is answered by the first rule.
    expect([await head('/api/user?case=none'), await head('/api/early')], [bare, bare]);
  });
  await check('mocked Response reports the request URL', async () => {
    expect((await call('/api/user?case=replace')).url, `${ORIGIN}/api/user?case=replace`);
  });

  console.log('XMLHttpRequest');
  await check('replace: status, responseText, headers, event order', async () => {
    const r = await xhr('/api/user?case=replace');
    expect(
      [r.status, JSON.parse(r.text), r.mockHeader, r.loadFired, r.states],
      [404, { name: 'Mocked' }, 'yes', true, [2, 3, 4]],
    );
    if (!r.allHeaders.includes('x-mock: yes'))
      throw new Error(`getAllResponseHeaders: ${r.allHeaders}`);
  });
  await check('server\'s body with responseType "json"', async () => {
    const r = await xhr('/api/user?case=merge', { responseType: 'json' });
    expect(
      [r.status, r.response.role, r.response.profile],
      [200, 'user', { city: 'Riga', age: 30 }],
    );
  });
  await check(
    "POST body reaches the real server through a server's-body rule",
    async () => {
      // /api/echo answers with the request it got.
      const r = await xhr('/api/echo?case=script', { method: 'POST', body: 'hello' });
      const echoed = r.response && JSON.parse(r.response);
      expect([echoed?.method, echoed?.body], ['POST', 'hello']);
    },
  );
  await check(
    "server's body over XHR: bytes as they were sent, and text in the charset the response names",
    async () => {
      // Up to 0.20.1 both came out of UTF-8 text: the bytes twice as long, the text as "������".
      const read = (query) =>
        page.evaluate(
          (q) =>
            new Promise((resolve) => {
              const results = {};
              const get = (name, target, type) => {
                const request = new XMLHttpRequest();
                request.open('GET', target);
                request.responseType = type;
                request.addEventListener('loadend', () => {
                  const { response } = request;
                  results[name] =
                    type === 'arraybuffer'
                      ? [response.byteLength, new Uint8Array(response)[255]]
                      : type === 'blob'
                        ? [response.size, response.type]
                        : response;
                  // Handed on, as a page that decodes in a worker hands it on: the buffer is
                  // empty from here.
                  if (type === 'arraybuffer')
                    new MessageChannel().port1.postMessage(response, [response]);
                  // In this order, whichever of them loads first.
                  const { bytes, blob, text, json } = results;
                  if (bytes && blob && text !== undefined && json)
                    resolve({ bytes, blob, text, json });
                });
                request.send();
              };
              get('bytes', `/api/bytes?${q}`, 'arraybuffer');
              get('blob', `/api/bytes?${q}`, 'blob');
              get('text', `/api/cp1251?${q}`, '');
              // Text taken as bytes: what Traffic lists of it is read before the page hands
              // the buffer on, not from what's left of it after.
              get('json', `/api/user?handed=1&${q}`, 'arraybuffer');
            }),
          query,
        );
      const before = errors.length;
      const real = await read('case=none');
      expect(
        [real.bytes, real.blob, real.text, real.json[0] > 0],
        [[2048, 255], [2048, 'application/octet-stream'], 'Привет', true],
        'no rule',
      );
      for (const query of KEEPS) expect(await read(query), real, query);
      await sleep(200);
      expect(errors.slice(before), [], 'errors in the page');
    },
  );
  await check(
    "a rule's answer held back past the page's xhr.timeout times out, as a slow server's would",
    async () => {
      // Up to 0.20.1 a request a rule answered ignored xhr.timeout: the page waited the whole
      // delay (600 ms here) and got load, so a delay couldn't show a client's timeout (axios's).
      const r = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const request = new XMLHttpRequest();
            const events = [];
            const started = performance.now();
            for (const type of ['load', 'timeout', 'error', 'abort', 'loadend'])
              request.addEventListener(type, () => {
                events.push(type);
                if (type === 'loadend')
                  resolve({
                    events,
                    status: request.status,
                    readyState: request.readyState,
                    text: request.responseText,
                    ms: performance.now() - started,
                  });
              });
            request.open('GET', '/api/user?case=delay');
            request.timeout = 200;
            request.send();
          }),
      );
      expect(
        [r.events, r.status, r.readyState, r.text],
        [['timeout', 'loadend'], 0, 4, ''],
        `after ${Math.round(r.ms)} ms`,
      );
      if (r.ms < 180 || r.ms > 500)
        throw new Error(`timed out after ${Math.round(r.ms)} ms, not 200`);
    },
  );
  await check(
    "open() with a third argument that isn't true is synchronous, as the browser reads it, and left alone",
    async () => {
      // The browser reads open(method, url, undefined) as synchronous, like 0, null and false.
      // Up to 0.20.1 undefined made the request asynchronous here, and one opened with 0 or null
      // that a rule matched was answered later, where a synchronous request is always left alone.
      const sync = (target) =>
        page.evaluate(
          (address) =>
            [undefined, 0, null, false].map((flag) => {
              const request = new XMLHttpRequest();
              request.open('GET', address, flag);
              request.send();
              // What the page has as send() returns.
              return `${flag}: ${request.readyState} ${request.readyState === 4 ? JSON.parse(request.responseText).name : ''}`;
            }),
          target,
        );
      const done = ['undefined: 4 Real', '0: 4 Real', 'null: 4 Real', 'false: 4 Real'];
      expect(
        [await sync('/api/user?case=none'), await sync('/api/user?case=replace')],
        [done, done],
      );
    },
  );
  await check(
    'an XMLHttpRequest aborted, or opened again, before the rules have arrived ends as it does without Ghostfetch',
    async () => {
      // A page's first script runs before Ghostfetch has its rules, and send() waits for them.
      // Up to 0.20.1 the request then went out whatever had happened since: one the page had
      // aborted loaded all the same, and one opened again went out with the first one's body.
      const seen = async (origin) => {
        const early = await context.newPage();
        await early.goto(`${origin}/early-xhr`);
        await early
          .waitForFunction(() => window.seen.reopened !== null, null, { timeout: 4000 })
          .catch(() => {});
        await sleep(300);
        const got = await early.evaluate(() => window.seen);
        await early.close();
        return got;
      };
      // evil.test is the same server under a name Ghostfetch doesn't run on.
      const without = await seen(EVIL_ORIGIN);
      expect(
        without,
        {
          aborted: ['loadstart', 'abort', 'loadend'],
          mocked: ['loadstart', 'abort', 'loadend'],
          reopened: 'second',
        },
        'without Ghostfetch',
      );
      expect(await seen(ORIGIN), without);
    },
  );
  await check('unmatched XHR goes to the network untouched', async () => {
    const r = await xhr('/api/user?case=none', { responseType: 'json' });
    expect(
      [r.status, r.response.name, r.url],
      [200, 'Real', `${ORIGIN}/api/user?case=none`],
    );
  });

  await check('redirect, header and block rules saved by 0.8 do nothing', async () => {
    const redirect = await call('/api/old-home');
    const echoed = await call('/api/echo');
    const blocked = await call('/api/blocked');
    expect(
      [
        redirect.status,
        redirect.url,
        echoed.body.headers['x-debug'],
        echoed.headers['x-resp'],
        blocked.error,
        blocked.status,
      ],
      [404, `${ORIGIN}/api/old-home`, undefined, undefined, undefined, 404],
    );
  });

  // Rules stored by hand, as a person or a script editing storage can leave them: one whose name
  // is a number, and one whose headers are an object, not a list. The editor reads them as a rule
  // with no name and one with no headers, and the page gets each rule as the editor reads it
  // (src/bounded-contexts/rules/application/page-state.ts), so both answer the page's fetch and
  // XMLHttpRequest as the editor shows them, and the page counts each answer under the rule. Up to
  // 0.25.1 the page got them as they were stored: the first broke every fetch it answered (the log
  // couldn't name it), and the second failed every request it matched.
  const storedByHand = async (id, change) => {
    const { rules } = await worker.evaluate(() => chrome.storage.local.get('rules'));
    const tab = (await worker.evaluate(() => chrome.tabs.query({}))).find(
      (candidate) => candidate.url === page.url(),
    );
    // What `read` gives once `done` says it's there, or what it gives after 3 s.
    const until = async (read, done) => {
      for (const end = Date.now() + 3000; ; await sleep(100)) {
        const value = await read();
        if (done(value) || Date.now() > end) return value;
      }
    };
    const target = `/api/user?case=${id}`;
    const byHand = createRule();
    byHand.id = id;
    byHand.match.url = `case=${id}`;
    byHand.response.body = JSON.stringify({ byHand: id });
    change(byHand);
    try {
      await setStorage({ rules: [byHand, ...rules] });
      // The server answers until the page has the rule.
      const fetched = await until(
        () => call(target),
        (got) => got.body?.name !== 'Real',
      );
      const overXhr = await xhr(target);
      const counted = await until(
        async () =>
          (
            await worker.evaluate(
              (tabId) =>
                chrome.tabs.sendMessage(
                  tabId,
                  { type: 'ghostfetch:counts' },
                  { frameId: 0 },
                ),
              tab.id,
            )
          ).rules[id] ?? null,
        (count) => count && count.mocked + count.failed >= 2,
      );
      return {
        fetch: fetched.error ?? [
          fetched.status,
          fetched.headers['content-type'],
          fetched.body,
        ],
        xhr: [overXhr.status, overXhr.text],
        counted,
      };
    } finally {
      await setStorage({ rules });
      await sleep(300);
    }
  };
  const answeredByHand = (id) => ({
    fetch: [200, 'application/json', { byHand: id }],
    xhr: [200, JSON.stringify({ byHand: id })],
    counted: { mocked: 2, modified: 0, failed: 0 },
  });
  await check(
    "a rule stored by hand whose name is a number answers the page's fetch and XMLHttpRequest, and the page counts both under it",
    async () => {
      const id = 'by-hand-name';
      const got = await storedByHand(id, (rule) => {
        rule.name = 5;
      });
      expect(got, answeredByHand(id));
    },
  );
  await check(
    "a rule stored by hand whose headers are an object, not a list, answers the page's fetch and XMLHttpRequest, and the page counts both under it",
    async () => {
      const id = 'by-hand-headers';
      const got = await storedByHand(id, (rule) => {
        rule.response.headers = { 'X-By-Hand': 'yes' };
      });
      expect(got, answeredByHand(id));
    },
  );

  console.log('switches');
  await check('master switch off disables every rule', async () => {
    await setStorage({ enabled: false });
    await sleep(400);
    expect((await call('/api/user?case=replace')).body.name, 'Real');
    await setStorage({ enabled: true });
    await sleep(400);
    expect((await call('/api/user?case=replace')).body, { name: 'Mocked' });
  });
  await check(
    "the toolbar badge counts the rules that are on in Ghostfetch's green, and says off in grey",
    async () => {
      // Up to 0.20.1 the count was on purple, the one colour left from before the green look.
      const badge = () =>
        worker.evaluate(async () => [
          await chrome.action.getBadgeText({}),
          await chrome.action.getBadgeBackgroundColor({}),
          await chrome.action.getBadgeTextColor({}),
        ]);
      const on = await badge();
      await setStorage({ enabled: false });
      await sleep(400);
      const off = await badge();
      await setStorage({ enabled: true });
      await sleep(400);
      // The rules as the editor lists them (none of 0.8's types), and of those the ones on.
      const count = String(RULES.filter((rule) => !rule.type && rule.enabled).length);
      expect(
        [on, off],
        [
          [count, [52, 211, 153, 255], [11, 11, 12, 255]],
          ['off', [107, 114, 128, 255], [255, 255, 255, 255]],
        ],
      );
    },
  );
  await check('rule edits apply to an open page without reloading', async () => {
    const rules = (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules;
    rules.find((r) => r.match.url === 'case=disabled').enabled = true;
    await setStorage({ rules });
    await sleep(300);
    expect((await call('/api/user?case=disabled')).body, { disabled: 'mocked' });
  });

  console.log('editor UI');
  const app = await context.newPage();
  // Rules or Traffic: the sidebar's row from 760px wide, the top bar's tab in a narrow panel.
  // Base UI keeps the other view's panel displayed for a frame after the switch (its exit
  // transition, though there's none, gets a frame to start; the panel is hidden before the
  // frame is painted), so wait for it to be hidden: a `:visible` locator would match both views.
  const show = async (view) => {
    await app
      .locator(`[data-testid="nav-${view}"]:visible, [data-testid="tab-${view}"]:visible`)
      .first()
      .click();
    await app
      .locator(`[data-testid="view-${view === 'rules' ? 'traffic' : 'rules'}"]`)
      .waitFor({ state: 'hidden', timeout: 3000 });
  };
  app.on('pageerror', (error) => errors.push(`app: ${error.message}`));
  app.on(
    'console',
    (message) =>
      message.type() === 'error' && errors.push(`app console: ${message.text()}`),
  );
  await app.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await app.waitForSelector('[data-testid="rule"]');

  await check(
    'rule list renders every rule, but not the redirect, header and block ones',
    async () => {
      expect(
        await app.locator('[data-testid="rule"]').count(),
        RULES.filter((rule) => !rule.type).length,
      );
    },
  );
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await app.locator('[data-testid="rule"]').nth(1).click();
    await app.screenshot({ path: `${SHOTS}/wide-rules.png` });
  }

  await check('create a rule in the editor and it mocks immediately', async () => {
    await app.click('[data-testid="new-rule"]');
    // New rule asks for a URL, with the cursor in its field; Enter makes the rule and opens it
    // with the cursor in its body, inside the {}.
    await app.waitForFunction(
      () => document.activeElement?.dataset.testid === 'composer-input',
      null,
      { timeout: 3000 },
    );
    await app.keyboard.type('case=ui');
    await app.keyboard.press('Enter');
    const editor = app.locator('.code textarea');
    await app.waitForFunction(
      () => document.activeElement === document.querySelector('.code textarea'),
      null,
      { timeout: 3000 },
    );
    expect(
      await editor.evaluate((textarea) => [textarea.value, textarea.selectionStart]),
      ['{\n  \n}', 4],
    );
    await app.fill('[data-testid="rule-name"]', 'Made in the UI');
    await editor.fill('{"ui": true}');
    await app.click('[data-testid="row-status"]');
    await app.click('[data-testid="status-201"]');
    await sleep(600);
    const r = await call('/api/user?case=ui');
    expect([r.status, r.body], [201, { ui: true }]);
    expect(
      await app.locator('[data-testid="code-status"]').textContent(),
      'Valid JSON · 1 line',
    );
  });
  await check('tester and invalid JSON feedback', async () => {
    await app.fill('[data-testid="tester"]', `${ORIGIN}/api/user?case=ui`);
    expect(
      await app.locator('[data-testid="tester-result"]').textContent(),
      'Matches: this rule would answer it',
    );
    await app.locator('.code textarea').fill('{"ui": ');
    // A mistake shows once typing pauses.
    await app.waitForFunction(() =>
      document
        .querySelector('[data-testid="code-status"]')
        .textContent.startsWith('Line 1: '),
    );
    await app.locator('.code textarea').fill('{"ui":true,"n":[1,2]}');
    await app.click('[data-testid="format"]');
    expect(
      await app.locator('.code textarea').inputValue(),
      '{\n  "ui": true,\n  "n": [\n    1,\n    2\n  ]\n}',
    );
  });
  await check(
    'the settings: each row shows its value and opens its editor in place, one at a time',
    async () => {
      const value = (name) =>
        app.locator(`[data-testid="row-${name}-value"]`).textContent();
      const row = (name) => app.click(`[data-testid="row-${name}"]`);
      const opened = () =>
        app.evaluate(() =>
          [
            ...document.querySelectorAll('[data-testid^="row-"][aria-expanded="true"]'),
          ].map((trigger) => trigger.dataset.testid),
        );
      // The status row is still open from the check before.
      expect([await value('status'), await opened()], ['201 Created', ['row-status']]);
      expect(await app.locator('[data-testid="status-name"]').textContent(), 'Created');
      await app.fill('[data-testid="status-code"]', '418');
      expect(
        await app.locator('[data-testid="status-name"]').textContent(),
        "I'm a Teapot",
      );
      await app.click('[data-testid="status-404"]');
      expect(
        [await value('status'), await app.inputValue('[data-testid="status-code"]')],
        ['404 Not Found', '404'],
      );
      // Opening another row closes the one that was open, in either card.
      await row('delay');
      expect(
        [await opened(), await app.locator('[data-testid="status-code"]').count()],
        [['row-delay'], 0],
      );
      await app.click('[data-testid="delay-1000"]');
      expect(await value('delay'), '1 s');
      // The chosen one again goes back to none.
      await app.click('[data-testid="delay-1000"]');
      expect(await value('delay'), 'None');
      await app.fill('[data-testid="delay"]', '600');
      expect(await value('delay'), '600 ms');
      // At most 10 minutes, as a rule is kept. Up to 0.20.1 a longer delay showed as typed, and
      // came back as 10 minutes once the editor opened again.
      await app.fill('[data-testid="delay"]', '700000');
      expect(
        [await value('delay'), await app.inputValue('[data-testid="delay"]')],
        ['600 s', '600000'],
        'a delay over 10 minutes',
      );
      await app.fill('[data-testid="delay"]', '600');
      await row('headers');
      await app.getByRole('button', { name: 'Add header' }).click();
      await app.keyboard.type('X-Tabbed');
      expect(await value('headers'), 'Sets 1');
      await sleep(400);
      const { rules } = await worker.evaluate(() => chrome.storage.local.get('rules'));
      const rule = rules.find((r) => r.match.url === 'case=ui');
      expect(
        [
          rule.response.status,
          rule.response.delay,
          rule.response.headers.map((h) => h.name),
        ],
        ['404', 600, ['X-Tabbed']],
      );
      await app.getByRole('button', { name: 'Remove header' }).last().click();
      expect(await value('headers'), 'No changes');
      await row('delay');
      await app.click('[data-testid="delay-0"]');
      await row('status');
      await app.click('[data-testid="status-201"]');
      // The URL being tried is still there, and the method shows on its row and in the sentence.
      await row('method');
      await app.click('[data-testid="method-POST"]');
      const description = () =>
        app.locator('[data-testid="rule-description"]').textContent();
      expect(
        [
          await value('method'),
          await description(),
          await app.inputValue('[data-testid="tester"]'),
          await app.locator('[data-testid="tester-result"]').textContent(),
        ],
        [
          'POST',
          'Answers POST requests whose URL contains case=ui with a 201 and the JSON below, without calling the server.',
          `${ORIGIN}/api/user?case=ui`,
          'Matches: this rule would answer it',
        ],
      );
      await app.click('[data-testid="method-ANY"]');
      expect(await value('method'), 'Any');
      await row('method');
      expect(await opened(), []);
    },
  );
  await check(
    'a JSON mistake is marked where it is, and clicking it puts the cursor there',
    async () => {
      const editor = app.locator('.code textarea');
      await editor.fill('{\n  "id": 42\n  "name": "Ada"\n}');
      expect(await app.locator('.code-error').count(), 0, 'not while typing');
      await app.waitForSelector('.code-error', { timeout: 3000 });
      expect(
        await app.evaluate(() =>
          [
            '.code-error',
            '.code-error-note',
            '.code-lines .error',
            '[data-testid="code-status"]',
          ].map((selector) => document.querySelector(selector).textContent.trim()),
        ),
        ['42', 'missing comma', '2', 'Line 2: missing comma after 42'],
      );
      const mark = await app.locator('.code-error').boundingBox();
      await app.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2);
      expect(
        await app.locator('.code-error-tip').textContent(),
        '✗ Missing comma after 42Line 2, column 9',
        'the whole message on hover',
      );
      await app.click('[data-testid="code-problem"]');
      expect(
        await editor.evaluate((textarea) => [
          document.activeElement === textarea,
          textarea.selectionStart,
        ]),
        [true, 10],
        'the cursor at the mistake',
      );
      // Fixed, it goes at once.
      await editor.fill('{\n  "id": 42,\n  "name": "Ada"\n}');
      expect(
        [
          await app.locator('.code-error').count(),
          await app.locator('[data-testid="code-status"]').textContent(),
        ],
        [0, 'Valid JSON · 4 lines'],
      );
    },
  );
  await check(
    'text size: Cmd/Ctrl with =, - and 0 in the body, shown for a moment, remembered',
    async () => {
      const editor = app.locator('.code textarea');
      const text = await editor.inputValue();
      // The size, what's remembered, and the size shown in the corner.
      const size = () =>
        app.evaluate(() => {
          const badge = document.querySelector('.code-size');
          return [
            getComputedStyle(document.querySelector('.code')).fontSize,
            localStorage.getItem('ghostfetch.fontSize'),
            badge.hidden ? '' : badge.textContent,
          ];
        });
      expect(await size(), ['11.5px', null, '']);
      await editor.focus();
      await app.keyboard.press('ControlOrMeta+=');
      await app.keyboard.press('ControlOrMeta+=');
      expect(await size(), ['13px', '13', '13 px']);
      await app.keyboard.press('ControlOrMeta+-');
      expect(await size(), ['12px', '12', '12 px']);
      await app.waitForSelector('.code-size', { state: 'hidden', timeout: 3000 });
      // Back at the default, nothing is kept. None of it typed anything.
      await app.keyboard.press('ControlOrMeta+0');
      expect(
        [...(await size()), await editor.inputValue()],
        ['11.5px', null, '11.5 px', text],
      );
    },
  );
  await check(
    "text size: the text grows and shrinks around the cursor's line, and with the cursor out of view, around the middle of the view",
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      await editor.fill(
        JSON.stringify(
          { items: Array.from({ length: 80 }, (_, id) => ({ id, name: `item ${id}` })) },
          null,
          2,
        ),
      );
      // How far down the view the middle of the cursor's line is, and where in the lines the
      // middle of the view is.
      const view = () =>
        editor.evaluate((textarea) => {
          const style = getComputedStyle(textarea);
          const lineHeight = parseFloat(style.lineHeight);
          const top = parseFloat(style.paddingTop);
          const line = textarea.value
            .slice(0, textarea.selectionStart)
            .split('\n').length;
          return {
            cursor: top + (line - 0.5) * lineHeight - textarea.scrollTop,
            middle: (textarea.scrollTop + textarea.clientHeight / 2 - top) / lineHeight,
          };
        });
      // The cursor on line 150, a third of the way down the view.
      await editor.evaluate((textarea) => {
        const start = textarea.value.split('\n').slice(0, 149).join('\n').length + 1;
        textarea.setSelectionRange(start + 4, start + 4);
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
        textarea.scrollTop = 149 * lineHeight - textarea.clientHeight / 3;
      });
      const seen = [];
      const { cursor } = await view();
      for (const key of ['=', '=', '=', '=', '-', '0']) {
        await app.keyboard.press(`ControlOrMeta+${key}`);
        seen.push(Math.abs((await view()).cursor - cursor) <= 1);
      }
      // The view back at the top, so the cursor is out of it.
      await editor.evaluate((textarea) => {
        textarea.scrollTop = 120;
      });
      const { middle } = await view();
      for (const key of ['=', '=', '0']) {
        await app.keyboard.press(`ControlOrMeta+${key}`);
        seen.push(Math.abs((await view()).middle - middle) <= 0.1);
      }
      await editor.fill(before);
      expect(seen, Array(9).fill(true));
    },
  );
  // Bodies of 80 items, which Format puts in directly, and of 40, which it puts in as an edit the
  // browser can undo (itemsBody()); the rule made in the UI, and another to go to and come back.
  const ITEMS = itemsBody(80);
  const FEWER_ITEMS = itemsBody(40);
  const madeInUi = app.locator('[data-testid="rule"]', { hasText: 'Made in the UI' });
  const anotherRule = app
    .locator('[data-testid="rule"]')
    .filter({ hasNotText: 'Made in the UI' })
    .first();
  const strip = (text) => text.replace(/[ \n\t\r]/g, '');
  await check(
    'Format keeps the cursor on the character it was on and its line where it was in the view, keeps a selection, with the cursor out of view keeps the middle of the view, and keeps every value as written (escaped slashes, a 40.0)',
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      // The text at the cursor (a | at it) or the selection, how far down the view the cursor's
      // line is, and the item the middle of the view shows.
      const view = () =>
        editor.evaluate((textarea) => {
          const style = getComputedStyle(textarea);
          const lineHeight = parseFloat(style.lineHeight);
          const top = parseFloat(style.paddingTop);
          const { value, selectionStart: start, selectionEnd: end, scrollTop } = textarea;
          const lines = value.split('\n');
          const middle = Math.floor(
            (scrollTop + textarea.clientHeight / 2 - top) / lineHeight,
          );
          return {
            at:
              start === end
                ? `${value.slice(start - 6, start)}|${value.slice(start, start + 2)}`
                : value.slice(start, end),
            y:
              top + (value.slice(0, end).split('\n').length - 1) * lineHeight - scrollTop,
            middle: /"id": ?(\d+)/.exec(lines[middle] + lines[middle + 1])?.[1],
          };
        });
      // The body as it was before Format, the selection from `text` (or the cursor `at` in it),
      // and its line a third of the way down the view, or the view `top` lines down.
      const put = (text, at, { length = 0, top = null } = {}) =>
        editor.evaluate(
          (textarea, [find, offset, size, lines]) => {
            const start = textarea.value.indexOf(find) + offset;
            textarea.setSelectionRange(start, start + size);
            const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
            const line = textarea.value.slice(0, start).split('\n').length - 1;
            textarea.scrollTop =
              lines === null
                ? line * lineHeight - textarea.clientHeight / 3
                : lines * lineHeight;
          },
          [text, at, length, top],
        );
      const format = async () => {
        const placed = await view();
        await app.click('[data-testid="format"]');
        return [placed, await view()];
      };
      const seen = [];
      await editor.fill(ITEMS);
      await put('"item 40"', 7);
      const [cursor, cursorAfter] = await format();
      seen.push(cursorAfter.at, Math.abs(cursorAfter.y - cursor.y) <= 1);
      seen.push(
        (await editor.inputValue()).includes(
          '"url": "https:\\/\\/api.example.com\\/items\\/40",\n      "price": 40.0\n',
        ),
      );
      await editor.fill(ITEMS);
      await put('"item 60"', 0, { length: 9 });
      seen.push((await format())[1].at);
      // The cursor at the top, the view 30 lines down.
      await editor.fill(ITEMS);
      await put('{', 0, { top: 30 });
      const [middle, middleAfter] = await format();
      seen.push(middleAfter.middle === middle.middle && Boolean(middle.middle));
      await editor.fill(before);
      expect(seen, ['item 4|0"', true, true, '"item 60"', true]);
    },
  );
  await check(
    'undo right after Format goes back to where the cursor and the scroll were before it, and redo to where they were after it; after a Format too long for the browser to undo, ⌘Z and ⇧⌘Z leave the body alone',
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      // The text, the cursor (a | at it) and the scroll.
      const where = () =>
        editor.evaluate((textarea) => {
          const { value, selectionStart: start, selectionEnd: end } = textarea;
          return {
            text: value,
            at:
              start === end
                ? `${value.slice(start - 6, start)}|${value.slice(start, start + 2)}`
                : '',
            top: Math.round(textarea.scrollTop),
          };
        });
      await editor.fill(FEWER_ITEMS);
      // The cursor in "item 30", its line a third of the way down the view.
      await editor.evaluate((textarea) => {
        const at = textarea.value.indexOf('"item 30"') + 7;
        textarea.setSelectionRange(at, at);
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
        const line = textarea.value.slice(0, at).split('\n').length - 1;
        textarea.scrollTop = line * lineHeight - textarea.clientHeight / 3;
      });
      const placed = await where();
      await app.click('[data-testid="format"]');
      const formatted = await where();
      await editor.focus();
      await app.keyboard.press('ControlOrMeta+z');
      const undone = await where();
      await app.keyboard.press('ControlOrMeta+Shift+z');
      const redone = await where();
      // A whole body pasted over it, and formatted: too long to undo. Chrome keeps the paste in
      // its history, and undoing and redoing that in the formatted text mixed the two.
      await editor.evaluate((textarea, text) => {
        textarea.focus();
        textarea.select();
        document.execCommand('insertText', false, text);
      }, ITEMS);
      await app.click('[data-testid="format"]');
      const long = await editor.inputValue();
      await editor.focus();
      await app.keyboard.press('ControlOrMeta+z');
      await app.keyboard.press('ControlOrMeta+Shift+z');
      const left = await editor.inputValue();
      await editor.fill(before);
      expect(
        [
          placed.at,
          formatted.at,
          formatted.text === formatJson(FEWER_ITEMS),
          undone.text === FEWER_ITEMS,
          [undone.at, undone.top],
          redone.text === formatted.text,
          [redone.at, redone.top],
          long === formatJson(ITEMS),
          left === long,
        ],
        [
          'item 3|0"',
          'item 3|0"',
          true,
          true,
          [placed.at, placed.top],
          true,
          [formatted.at, formatted.top],
          true,
          true,
        ],
      );
    },
  );
  await check(
    "after a Format too long to undo: ⌘Z in the rule's name doesn't reach into the body, ⌘Z in the body undoes what was changed since, back to the formatted body (even once a change has put it back as it was) and no further, ⇧⌘Z redoes it, and what's saved is what you see",
    async () => {
      const editor = app.locator('.code textarea');
      const name = app.locator('[data-testid="rule-name"]');
      const before = await editor.inputValue();
      // A whole body pasted over it, a step of Chrome's history, which is the page's: under the
      // formatted body, it's the next thing ⌘Z would undo, in the body or in another field.
      await editor.evaluate((textarea, text) => {
        textarea.focus();
        textarea.select();
        document.execCommand('insertText', false, text);
      }, ITEMS);
      await app.click('[data-testid="format"]');
      const long = await editor.inputValue();
      await name.click();
      await app.keyboard.press('ControlOrMeta+z');
      const fromName = [await editor.inputValue(), await name.inputValue()];
      // x typed in "item 40", then deleted as a step of its own (the caret moved off and back).
      await editor.evaluate((textarea) => {
        const at = textarea.value.indexOf('"item 40"') + 5;
        textarea.focus();
        textarea.setSelectionRange(at, at);
      });
      await app.keyboard.type('x');
      const typed = await editor.inputValue();
      await app.keyboard.press('ArrowRight');
      await app.keyboard.press('ArrowLeft');
      await app.keyboard.press('Backspace');
      const states = [await editor.inputValue()];
      for (const keys of ['z', 'z', 'z', 'Shift+z']) {
        await app.keyboard.press(`ControlOrMeta+${keys}`);
        states.push(await editor.inputValue());
      }
      await sleep(400);
      const { rules } = await worker.evaluate(() => chrome.storage.local.get('rules'));
      const saved = rules.find((r) => r.match.url === 'case=ui').response.body;
      await editor.fill(before);
      const named = (text) =>
        text === long ? 'formatted' : text === typed ? 'x typed' : `${text.length} chars`;
      expect(
        [named(fromName[0]), fromName[1], ...states.map(named), named(saved)],
        [
          'formatted',
          'Made in the UI',
          'formatted',
          'x typed',
          'formatted',
          'formatted',
          'x typed',
          'x typed',
        ],
      );
    },
  );
  await check(
    "while the body isn't focused, its cursor is marked where it is (back at a rule, where it was left), as vim's block is outlined, and the mark goes while it's focused",
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      await editor.fill(ITEMS);
      await editor.evaluate((textarea) => {
        const at = textarea.value.indexOf('"item 40"') + 7;
        textarea.setSelectionRange(at, at);
      });
      await anotherRule.click();
      await madeInUi.click();
      // What's before the mark on its line, while it shows.
      const mark = () =>
        app.evaluate(() => {
          const caret = document.querySelector('.code-cursor .code-caret');
          return caret && getComputedStyle(caret).display !== 'none'
            ? caret.previousSibling.data
            : null;
        });
      const shown = await mark();
      await editor.focus();
      const focused = await mark();
      await editor.fill(before);
      expect([shown, focused], ['  {"id": 40, "name": "item 4', null]);
    },
  );
  await check(
    "back at a rule, its body is where it was (the selection, the scroll, a narrow panel's own scroll too), and so after a change made in another view",
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      await editor.fill(formatJson(ITEMS));
      // The selection and its direction, the body's scroll and the pane's.
      const where = () =>
        app.evaluate(() => {
          const textarea = document.querySelector('.code textarea');
          return [
            textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
            textarea.selectionDirection,
            Math.round(textarea.scrollTop),
            Math.round(textarea.closest('[data-slot="pane-scroll"]').scrollTop),
          ];
        });
      // "item 40" selected from its end, the body and the pane scrolled, and two frames for the
      // pane's scroll event.
      const put = (pane) =>
        app.evaluate(
          (paneTop) =>
            new Promise((resolve) => {
              const textarea = document.querySelector('.code textarea');
              const at = textarea.value.indexOf('"item 40"');
              textarea.setSelectionRange(at, at + 9, 'backward');
              textarea.scrollTop = 1500;
              textarea.closest('[data-slot="pane-scroll"]').scrollTop = paneTop;
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }),
          pane,
        );
      const seen = [];
      await put(0);
      const beside = await where();
      await anotherRule.click();
      await madeInUi.click();
      seen.push(await where());
      // In a side panel the pane scrolls, down to the body: back to the list, then the rule.
      await app.setViewportSize({ width: 400, height: 760 });
      await put(300);
      const narrow = await where();
      await app.click('[data-testid="rule-back"]');
      await madeInUi.click();
      seen.push(await where());
      await app.setViewportSize({ width: 1280, height: 820 });
      // Rules changed in another view (the popup, say), with the focus outside the rule: the
      // body editor starts over from them, where it was.
      await put(0);
      await editor.evaluate((textarea) => {
        textarea.dataset.old = '';
        textarea.blur();
      });
      // Once the body is saved: a change from elsewhere takes the place of a save still waiting
      // (src/bounded-contexts/rules/infrastructure/order-storage.ts), and would bring the body
      // back as it was.
      await worker.evaluate(
        async (body) => {
          for (let tries = 0; tries < 60; tries++) {
            const { rules } = await chrome.storage.local.get('rules');
            if (rules.some((stored) => stored.response.body === body)) {
              rules[0].updatedAt += 1;
              await chrome.storage.local.set({ rules, rulesWriter: 'another-view:1' });
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error('the body was never saved');
        },
        await editor.inputValue(),
      );
      await app.waitForFunction(
        () => !('old' in document.querySelector('.code textarea').dataset),
        null,
        { timeout: 3000 },
      );
      seen.push(await where());
      await editor.fill(before);
      expect(seen, [beside, narrow, beside], JSON.stringify([beside, narrow]));
    },
  );
  await check(
    'a long body is coloured where it is on screen, and only there',
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      // The pieces on the highlight layer, and the coloured tokens in them.
      const painted = () =>
        app.evaluate(() => {
          const layer = document.querySelector('.code-highlight .code-text');
          return {
            tokens: layer.querySelectorAll('[class^="tk-"]').length,
            pieces: layer.querySelectorAll(':scope > span').length,
          };
        });
      const scroll = (to) =>
        editor.evaluate((textarea, end) => {
          textarea.scrollTop = end ? textarea.scrollHeight : 0;
          textarea.scrollLeft = end ? textarea.scrollWidth : 0;
        }, to);
      const items = Array.from({ length: 5000 }, (_, id) => ({
        id,
        name: `user ${id}`,
        on: true,
      }));
      // 200,000 characters on one line, as a captured response often is. Then Format makes it
      // 370,000 over 25,000 lines in one edit, which Chrome fires an input for per line: the
      // editor redraws and the rule is saved once, not 25,000 times.
      await editor.fill(JSON.stringify({ items }));
      for (const shape of ['on one line', 'formatted']) {
        if (shape === 'formatted') {
          const started = Date.now();
          await app.click('[data-testid="format"]');
          await app.waitForFunction(
            () => document.querySelector('.code textarea').value.startsWith('{\n'),
            null,
            { timeout: 10_000 },
          );
          const took = Date.now() - started;
          if (took > 3000) throw new Error(`Format took ${took} ms`);
          await sleep(400);
          const { rules } = await worker.evaluate(() =>
            chrome.storage.local.get('rules'),
          );
          expect(
            rules.find((r) => r.match.url === 'case=ui').response.body,
            JSON.stringify({ items }, null, 2),
            'the formatted body is saved',
          );
        }
        // At either end of the body, its first or its last piece has colours and the other
        // hasn't, once the layer has caught up with the scroll.
        for (const end of [false, true]) {
          await scroll(end);
          await app.waitForFunction(
            (atEnd) => {
              const pieces = document.querySelectorAll(
                '.code-highlight .code-text > span',
              );
              const coloured = (piece) => Boolean(piece.querySelector('[class^="tk-"]'));
              return (
                coloured(pieces[atEnd ? pieces.length - 1 : 0]) &&
                !coloured(pieces[atEnd ? 0 : pieces.length - 1])
              );
            },
            end,
            { timeout: 3000 },
          );
          const now = await painted();
          if (now.pieces < 20 || now.tokens > 6000)
            throw new Error(`${shape}, ${end ? 'end' : 'start'}: ${JSON.stringify(now)}`);
        }
      }
      await editor.fill(before);
    },
  );
  await check(
    "typing in a long body redraws only the piece typed into, a new line only adds its number, the editor's sizes are its own, and the boxes around it change only in size between its two layouts",
    async () => {
      // What keeps typing in a long body quick (code-editor.ts, code-editor.css and the rule
      // editor's layout): none of it shows, so it's checked here.
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      const items = Array.from({ length: 5000 }, (_, id) => ({ id, name: `user ${id}` }));
      // Put in as one edit (fill() would type it a line at a time, 25,000 times).
      await editor.evaluate(
        (textarea, text) => {
          textarea.value = text;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        },
        JSON.stringify({ items }, null, 2),
      );
      await sleep(300);
      // The pieces and the gutter's text are marked, then a character and a line are typed
      // near the top.
      const marked = await app.evaluate(() => {
        const pieces = document.querySelectorAll('.code-highlight .code-text > span');
        pieces.forEach((piece, index) => {
          piece.dataset.probe = String(index);
        });
        window.gutterProbe = document.querySelector('.code-lines').firstChild;
        return pieces.length;
      });
      await editor.click({ position: { x: 200, y: 60 } });
      await app.keyboard.type('x');
      await app.keyboard.press('Enter');
      await sleep(200);
      const after = await app.evaluate(() => {
        const pieces = [
          ...document.querySelectorAll('.code-highlight .code-text > span'),
        ];
        const textarea = document.querySelector('.code textarea');
        const lines = document.querySelector('.code-lines');
        const code = document.querySelector('.code');
        const own = (name) => [
          getComputedStyle(code).getPropertyValue(name) !== '',
          getComputedStyle(textarea).getPropertyValue(name),
        ];
        return {
          pieces: pieces.length,
          kept: pieces.filter((piece) => piece.dataset.probe).length,
          gutter: [
            lines.firstChild === window.gutterProbe,
            lines.textContent.split('\n').at(-1),
          ],
          lines: textarea.value.split('\n').length,
          fit: own('--code-fit'),
          max: own('--code-max'),
        };
      });
      // The boxes around the body editor, from the editor up to the pane: between the settings
      // beside the body and under it, each keeps its display, flex, order, padding and gaps (a
      // change to any of them has a browser lay the body out again from scratch), and changes
      // only its size and margins.
      const boxes = () =>
        app.evaluate(() => {
          const seen = [];
          for (
            let box = document.querySelector('.code');
            box.dataset.slot !== 'pane-scroll';
            box = box.parentElement
          ) {
            const style = getComputedStyle(box);
            seen.push(
              [
                style.display,
                style.flexDirection,
                style.flexWrap,
                style.flex,
                style.order,
                style.padding,
                style.rowGap,
                style.columnGap,
              ].join(' '),
            );
          }
          return seen;
        });
      const beside = await boxes();
      await app.setViewportSize({ width: 1000, height: 820 });
      const under = await boxes();
      await app.setViewportSize({ width: 1280, height: 820 });
      // Back as it was, as one edit too.
      await editor.evaluate((textarea, text) => {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }, before);
      expect(
        [
          after.pieces >= marked - 1 && after.pieces <= marked + 2,
          after.kept >= marked - 2,
          after.gutter,
          after.fit,
          after.max,
          beside.length > 3 && JSON.stringify(under) === JSON.stringify(beside),
        ],
        [true, true, [true, String(after.lines)], [true, ''], [true, ''], true],
        JSON.stringify({ marked, after, beside, under }),
      );
    },
  );
  await check(
    'the body fills the pane beside the settings; under them, it is as tall as its text and never taller than the pane',
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      // The editor's height and the pane's; with the pane scrolled to the top, how far the body's
      // section ends from the pane's bottom, and whether the pane has anything to scroll.
      const heights = () =>
        app.evaluate(() => {
          const code = document.querySelector('.code');
          const pane = code.closest('[data-slot="pane-scroll"]');
          pane.scrollTop = 0;
          return {
            code: code.offsetHeight,
            pane: pane.clientHeight,
            gap:
              pane.getBoundingClientRect().bottom -
              document.querySelector('[data-testid="body-card"]').getBoundingClientRect()
                .bottom,
            scrolls: pane.scrollHeight > pane.clientHeight,
          };
        });
      const short = '{"short": true}';
      const eight =
        '{\n  "a": 1,\n  "b": 2,\n  "c": 3,\n  "d": 4,\n  "e": 5,\n  "f": 6\n}';
      const long = JSON.stringify(
        { items: Array.from({ length: 200 }, (_, id) => ({ id })) },
        null,
        2,
      );
      // Beside the settings (this window is 1280 px wide): short or long, the body's section
      // ends at the pane's bottom, less its 16 px of padding, and a long body scrolls inside.
      await editor.fill(short);
      const besideShort = await heights();
      await editor.fill(long);
      const besideLong = await heights();
      for (const shape of [besideShort, besideLong])
        if (
          Math.abs(shape.gap - 16) > 1 ||
          shape.scrolls ||
          shape.code !== besideLong.code
        )
          throw new Error(`beside: ${JSON.stringify([besideShort, besideLong])}`);
      // Under them, in a side panel 400 px wide.
      await app.setViewportSize({ width: 400, height: 760 });
      await editor.fill(short);
      expect((await heights()).code, 120, 'a short body: the smallest editor');
      await editor.fill(eight);
      // Eight lines of 20.125 px (11.5 px text, line height 1.75), its padding and border.
      expect((await heights()).code, 179, 'eight lines: eight lines tall');
      // A long one: the pane less the room for the body's controls (body-card.tsx).
      await editor.fill(long);
      const under = await heights();
      if (Math.abs(under.code - (under.pane - 120)) > 1)
        throw new Error(`a long body, in one column: ${JSON.stringify(under)}`);
      await app.setViewportSize({ width: 1280, height: 820 });
      await editor.fill(before);
    },
  );
  await check('Cmd/Ctrl+F in the body searches only the body', async () => {
    const editor = app.locator('.code textarea');
    const count = () => app.locator('.code-find-count').textContent();
    await editor.fill('{\n  "name": "Ada",\n  "nickname": "ada",\n  "team": "Adalab"\n}');
    await editor.evaluate((textarea) => textarea.setSelectionRange(0, 0));
    // The page must not see the shortcut, or the browser opens its own find bar.
    await app.evaluate(() => {
      window.findDefaultPrevented = null;
      addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'f')
          window.findDefaultPrevented = event.defaultPrevented;
      });
    });
    await editor.press('Control+f');
    await app.waitForSelector('.code-find:not([hidden])');
    expect(
      await app.evaluate(() => window.findDefaultPrevented),
      true,
      'shortcut handled',
    );
    await app.keyboard.type('ADA');
    expect(await count(), '1 / 3', 'case-insensitive');
    expect(await app.locator('.code-marks mark').count(), 3);
    await app.keyboard.press('Enter');
    expect(await count(), '2 / 3');
    await app.keyboard.press('Shift+Enter');
    await app.keyboard.press('Shift+Enter');
    expect(await count(), '3 / 3', 'wraps around');
    // Esc goes back to the body with that match selected, and clears the marks.
    await app.keyboard.press('Escape');
    expect(await app.locator('.code-find').isHidden(), true);
    expect(
      await editor.evaluate((textarea) => [
        document.activeElement === textarea,
        textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
      ]),
      [true, 'Ada'],
    );
    expect(await app.locator('.code-marks mark').count(), 0);
    // A word selected in the body becomes the query.
    await editor.evaluate((textarea) =>
      textarea.setSelectionRange(
        textarea.value.indexOf('team'),
        textarea.value.indexOf('team') + 4,
      ),
    );
    await editor.press('Control+f');
    expect([await app.inputValue('.code-find-input'), await count()], ['team', '1 / 1']);
    await app.keyboard.type('zzz');
    expect(await count(), 'No results');
    await app.keyboard.press('Escape');
  });

  console.log('vim keys in the body editor');
  // p reads the clipboard once the browser lets Ghostfetch, which takes the browser's dialog: until
  // the clipboard check below, the browser was told no, so p puts vim's register, as it does on the
  // Zen test's page (which reads no clipboard).
  await app.evaluate(() => localStorage.setItem('ghostfetch.clipboard', '1'));
  const vimSwitch = app.locator('[data-testid="vim"]');
  const body = app.locator('.code textarea');
  const VIM_PRESS = {
    '<Esc>': 'Escape',
    '<CR>': 'Enter',
    '<BS>': 'Backspace',
    '<Del>': 'Delete',
  };
  const typeVim = async (keys) => {
    for (const key of vimKeys(keys)) {
      if (VIM_PRESS[key]) await app.keyboard.press(VIM_PRESS[key]);
      else if (key.startsWith('<C-')) await app.keyboard.press(`Control+${key[3]}`);
      else await app.keyboard.type(key);
    }
  };
  // The body, and the status line: cursor ("2:3"), mode and message.
  const vimState = () =>
    app.evaluate(() => {
      const [, line, column] = /Ln (\d+), Col (\d+)/.exec(
        document.querySelector('.code-vim-pos').textContent,
      );
      return {
        body: document.querySelector('.code textarea').value,
        cursor: `${line}:${column}`,
        mode: document.querySelector('.code-vim-mode').textContent,
        message: document.querySelector('.code-vim-keys').textContent,
      };
    });
  const bodyFocused = () =>
    body.evaluate((textarea) => document.activeElement === textarea);
  // Puts text in the body the way a paste would, without going through vim's keys.
  const setBody = (text) =>
    body.evaluate((textarea, value) => {
      textarea.focus();
      textarea.value = value;
      textarea.setSelectionRange(0, 0);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);

  await check(
    'the Vim switch turns on Normal mode: block cursor, status line, typing kept out',
    async () => {
      await body.fill(VIM_START);
      expect(
        [
          await vimSwitch.getAttribute('aria-pressed'),
          await app.locator('.code-vim').isHidden(),
        ],
        ['false', true],
      );
      await vimSwitch.click();
      expect(
        [await vimSwitch.getAttribute('aria-pressed'), await bodyFocused()],
        ['true', true],
      );
      expect(
        [(await vimState()).mode, await app.locator('.code-cursor .cursor').count()],
        ['Normal', 1],
      );
      await app.keyboard.type('Q');
      expect(await body.inputValue(), VIM_START);
    },
  );
  await check(
    'vim keys edit the body and the edits are saved (the same steps as the Zen test)',
    async () => {
      let expected = VIM_START;
      for (const [keys, after, cursor, message = ''] of VIM_STEPS) {
        await typeVim(keys);
        expected = after ?? expected;
        const state = await vimState();
        expect(
          [state.body, state.cursor, state.mode, state.message],
          [expected, cursor, 'Normal', message],
          keys,
        );
      }
      if (SHOTS) await app.screenshot({ path: `${SHOTS}/vim.png` });
      await sleep(600);
      expect((await call('/api/user?case=ui')).body, JSON.parse(expected));
    },
  );
  await check(
    'vim: u in the body never undoes another field (Chrome keeps one undo history per page)',
    async () => {
      // The rule's name, over its settings.
      const name = app.locator('[data-testid="rule-name"]');
      await name.click();
      await name.press('End');
      await app.keyboard.type('X');
      await body.focus();
      await typeVim('u');
      expect(
        [await name.inputValue(), (await vimState()).message, await bodyFocused()],
        ['Made in the UIX', 'Already at oldest change', true],
      );
      await name.fill('Made in the UI');
    },
  );
  await check(
    'vim: Tab leaves the body in Normal mode; in Insert mode it indents, and Esc then Tab leaves',
    async () => {
      await body.focus();
      await typeVim('gg');
      await app.keyboard.press('Tab');
      expect(await bodyFocused(), false, 'Tab in Normal mode');
      await body.focus();
      const before = await body.inputValue();
      await typeVim('i');
      expect((await vimState()).mode, 'Insert');
      await app.keyboard.press('Tab');
      expect(await body.inputValue(), `  ${before}`, 'Tab in Insert mode');
      await typeVim('<Esc>');
      await app.keyboard.press('Tab');
      expect(await bodyFocused(), false, 'Esc, then Tab');
      await body.focus();
      await typeVim('u');
      expect(await body.inputValue(), before);
    },
  );
  await check(
    'vim: dragging a selection starts Visual mode, a click goes back to Normal',
    async () => {
      const box = await body.boundingBox();
      // On whole pixels, as a mouse reports them: from some fractional points, Chrome takes a drag
      // that Playwright sends for a click that moves the cursor, and nothing gets selected.
      const x = Math.round(box.x);
      const y = Math.round(box.y);
      await app.mouse.move(x + 30, y + 30);
      await app.mouse.down();
      await app.mouse.move(x + 120, y + 30, { steps: 4 });
      await app.mouse.up();
      const selected = await vimState();
      expect(selected.mode, 'Visual');
      if (!/^\d+ chars?$/.test(selected.message))
        throw new Error(`selection size: ${selected.message}`);
      await app.mouse.click(x + 30, y + 50);
      expect((await vimState()).mode, 'Normal');
    },
  );
  await check(
    'vim: a yank goes to the clipboard as well (in Visual mode, by lines, with a motion), a delete leaves it alone, and the status line says when the browser refuses',
    async () => {
      // Each write the editor makes, still the browser's own, kept so a paste can wait for it:
      // Chrome checks its permission first, so for a moment after the key the clipboard still
      // holds what was there before (far shorter than it takes a person to paste).
      await app.evaluate(() => {
        const write = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = (text) => (window.lastWrite = write(text));
      });
      // What's on the clipboard: pasted with Cmd/Ctrl+V into a text area of its own, as into
      // another app. A headless browser keeps a clipboard of its own, so this leaves yours alone
      // (unless HEADED is set).
      const clipboard = async () => {
        await app.evaluate(() => {
          const probe = document.createElement('textarea');
          probe.id = 'paste-probe';
          document.body.append(probe);
          probe.focus();
          return window.lastWrite;
        });
        await app.keyboard.press('ControlOrMeta+v');
        const pasted = await app.evaluate(() => {
          const probe = document.getElementById('paste-probe');
          probe.remove();
          return probe.value;
        });
        await body.focus();
        return pasted;
      };
      await setBody(VIM_START);
      const seen = [];
      for (const keys of ['jwvi"y', 'Vjy', 'Gkf[y%', 'xu']) {
        await typeVim(keys);
        seen.push([keys, await clipboard()]);
      }
      await app.evaluate(() => delete navigator.clipboard.writeText);
      expect(seen, [
        ['jwvi"y', 'name'],
        ['Vjy', '  "name": "Ada",\n  "role": "admin",\n'],
        ['Gkf[y%', '[1, 2, 3]'],
        ['xu', '[1, 2, 3]'],
      ]);
      // The browser refusing it, as Chrome does a page that isn't focused: the status line says
      // so, and p still puts the yank.
      await app.evaluate(() => {
        navigator.clipboard.writeText = () =>
          Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'));
      });
      await typeVim('yy');
      const { message } = await vimState();
      await app.evaluate(() => delete navigator.clipboard.writeText);
      await typeVim('p');
      const put = (await body.inputValue()).split('\n')[4];
      await typeVim('u');
      expect([message, put], ["Couldn't copy to the clipboard", '  "tags": [1, 2, 3]']);
    },
  );
  await check(
    'vim: G, gg and 50% scroll a long body with the cursor in view, the block exactly on its character 15,000 lines down',
    async () => {
      const long = JSON.stringify(
        { items: Array.from({ length: 80 }, (_, id) => ({ id, name: `item ${id}` })) },
        null,
        2,
      );
      await setBody(long);
      const inView = () =>
        app.evaluate(() => {
          const cursor = document
            .querySelector('.code-cursor .cursor')
            .getBoundingClientRect();
          const view = document.querySelector('.code textarea').getBoundingClientRect();
          return cursor.top >= view.top && cursor.bottom <= view.bottom;
        });
      await typeVim('G');
      expect(
        [(await vimState()).cursor, await inView()],
        [`${long.split('\n').length}:1`, true],
        'G',
      );
      // The cursor's layer holds its line alone, and scrolls as far as the textarea does.
      expect(
        await app.evaluate(() => {
          const text = document.querySelector('.code-cursor .code-text');
          const textarea = document.querySelector('.code textarea');
          return [
            text.textContent.includes('\n'),
            text.parentElement.scrollHeight >= textarea.scrollHeight,
          ];
        }),
        [false, true],
        'cursor layer',
      );
      await typeVim('gg');
      expect(
        [await body.evaluate((textarea) => textarea.scrollTop), await inView()],
        [0, true],
        'gg',
      );
      await typeVim('50%');
      expect(await inView(), true, '50%');
      // The block sits exactly on its character, where the coloured text has it, in a body of
      // 15,000 lines: a line height off by a hair would add up that far down. Put in as one
      // edit (fill() would type it a line at a time).
      await body.evaluate(
        (textarea, text) => {
          textarea.value = text;
          textarea.setSelectionRange(0, 0);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        },
        JSON.stringify(
          {
            items: Array.from({ length: 3000 }, (_, id) => ({ id, name: `item ${id}` })),
          },
          null,
          2,
        ),
      );
      const onItsCharacter = () =>
        app.evaluate(() => {
          const textarea = document.querySelector('.code textarea');
          const block = document
            .querySelector('.code-cursor .cursor')
            .getBoundingClientRect();
          const walker = document.createTreeWalker(
            document.querySelector('.code-highlight .code-text'),
            NodeFilter.SHOW_TEXT,
          );
          let offset = textarea.selectionStart;
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (offset < node.length) {
              const range = document.createRange();
              range.setStart(node, offset);
              range.setEnd(node, offset + 1);
              const char = range.getBoundingClientRect();
              return (
                Math.abs(char.top - block.top) < 1 && Math.abs(char.left - block.left) < 1
              );
            }
            offset -= node.length;
          }
          return false;
        });
      const placed = [];
      for (const keys of ['G', '50%', 'gg']) {
        await typeVim(keys);
        placed.push([keys, await onItsCharacter()]);
      }
      expect(
        placed,
        [
          ['G', true],
          ['50%', true],
          ['gg', true],
        ],
        'on its character',
      );
    },
  );
  await check('vim: Format still works in Normal mode', async () => {
    await setBody('{"a":1,"b":[1,2]}');
    await app.click('[data-testid="format"]');
    expect(await body.inputValue(), '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });
  await check(
    "vim: Format keeps the cursor on its character and its line where it was in the view, and back at the rule, it's there still",
    async () => {
      const before = await body.inputValue();
      // The text from the cursor on, its line, and how far down the view that is.
      const cursor = () =>
        body.evaluate((textarea) => {
          const style = getComputedStyle(textarea);
          const at = textarea.selectionStart;
          const line = textarea.value.slice(0, at).split('\n').length;
          const y =
            parseFloat(style.paddingTop) +
            (line - 1) * parseFloat(style.lineHeight) -
            textarea.scrollTop;
          return { on: textarea.value.slice(at, at + 7), line, y: Math.round(y) };
        });
      await setBody(ITEMS);
      await typeVim('/item 40<CR>');
      await body.evaluate((textarea) => {
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
        const line =
          textarea.value.slice(0, textarea.selectionStart).split('\n').length - 1;
        textarea.scrollTop = line * lineHeight - textarea.clientHeight / 3;
      });
      const placed = await cursor();
      await app.click('[data-testid="format"]');
      const formatted = await cursor();
      const state = await vimState();
      await anotherRule.click();
      await madeInUi.click();
      const back = [await cursor(), (await vimState()).cursor];
      await setBody(before);
      expect(
        [
          formatted.on,
          formatted.line > placed.line,
          Math.abs(formatted.y - placed.y) <= 1,
          state.cursor.split(':')[0],
          state.mode,
          back,
        ],
        [
          'item 40',
          true,
          true,
          String(formatted.line),
          'Normal',
          [formatted, state.cursor],
        ],
      );
    },
  );
  await check(
    'vim: Visual mode carries on through Format, the same text selected',
    async () => {
      const before = await body.inputValue();
      const selected = () =>
        body.evaluate((textarea) =>
          textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
        );
      await setBody(ITEMS);
      await typeVim('/item 40<CR>vjj');
      const was = [await selected(), (await vimState()).mode];
      await app.click('[data-testid="format"]');
      const now = [await selected(), (await vimState()).mode];
      await typeVim('<Esc>');
      await setBody(before);
      expect(
        [was[1], now[1], strip(now[0]) === strip(was[0]), now[0] !== was[0]],
        ['Visual', 'Visual', true, true],
      );
    },
  );
  await check(
    "vim: u right after Format puts the cursor back where it was before it, Ctrl+R where it was after it, and after a Format too long to undo, u says there's nothing to undo",
    async () => {
      const before = await body.inputValue();
      await setBody(FEWER_ITEMS);
      await typeVim('/item 30<CR>');
      const was = await vimState();
      await app.click('[data-testid="format"]');
      const formatted = await vimState();
      await body.focus();
      await typeVim('u');
      const undone = await vimState();
      await typeVim('<C-r>');
      const redone = await vimState();
      await setBody(ITEMS);
      await app.click('[data-testid="format"]');
      const long = await body.inputValue();
      await body.focus();
      await typeVim('u');
      const refused = await vimState();
      await setBody(before);
      expect(
        [
          undone.body === FEWER_ITEMS,
          undone.cursor,
          redone.body === formatted.body,
          redone.cursor,
          refused.body === long,
          refused.message,
        ],
        [true, was.cursor, true, formatted.cursor, true, 'Already at oldest change'],
      );
    },
  );
  await check(
    'vim: after a Format too long to undo, u undoes the changes since, back to the formatted body (a character yanked and x, then P, which puts it back as it was) and no further',
    async () => {
      const before = await body.inputValue();
      await setBody(ITEMS);
      await app.click('[data-testid="format"]');
      const long = await body.inputValue();
      await body.focus();
      // x leaves the register as it is, so the character is yanked (yl) for P to put back.
      await typeVim('/item 40<CR>ylx');
      const deleted = await body.inputValue();
      await typeVim('P');
      const states = [await body.inputValue()];
      for (let step = 0; step < 3; step++) {
        await typeVim('u');
        states.push(await body.inputValue());
      }
      const { message } = await vimState();
      await setBody(before);
      const named = (text) =>
        text === long ? 'formatted' : text === deleted ? 'x' : `${text.length} chars`;
      expect(
        [...states.map(named), message],
        ['formatted', 'x', 'formatted', 'formatted', 'Already at oldest change'],
      );
    },
  );
  await check(
    "vim: / opens the body's find bar as the search line, and Esc cancels it",
    async () => {
      await body.focus();
      await typeVim('gg/');
      const bar = app.locator('.code-find');
      expect(
        [
          await bar.isVisible(),
          await bar.evaluate((element) => element.classList.contains('vim-search')),
          await app.locator('.code-find-icon').textContent(),
        ],
        [true, true, '/'],
      );
      await app.keyboard.type('b');
      await app.keyboard.press('Escape');
      expect(
        [await bar.isHidden(), (await vimState()).cursor, await bodyFocused()],
        [true, '1:1', true],
      );
    },
  );
  await check(
    "vim: p pastes what's on the clipboard once the browser lets Ghostfetch read it (asked the first time); where the browser gives it nothing p puts the yank, but for the once right after the dialog, when it says to press p again; turned down it puts the yank and doesn't ask again, and :set clipboard=unnamedplus asks again",
    async () => {
      const state = async () => [
        (await body.inputValue()).split('\n').slice(0, 3).join('|'),
        (await vimState()).message,
        await app.evaluate(() => [
          window.asked,
          localStorage.getItem('ghostfetch.clipboard'),
        ]),
      ];
      // p has read the clipboard, or given up: the status line says something again.
      const said = () =>
        app.waitForFunction(() => document.querySelector('.code-vim-keys').textContent);
      try {
        // The browser's dialog answered (Allow while `allow`), and how many times it was asked:
        // standing in for a person, as Chromium shows the dialog even when headless. And the
        // clipboard, which the browser would only let the extension's page read with the
        // permission granted: what the editor writes to it is what it reads back, unless the
        // browser gives nothing (`unreadable`).
        await app.evaluate(() => {
          window.realRequest = chrome.permissions.request;
          window.asked = 0;
          window.allow = true;
          chrome.permissions.request = async () => {
            window.asked++;
            return window.allow;
          };
          window.clipboardText = '';
          navigator.clipboard.writeText = async (text) => {
            window.clipboardText = text;
          };
          navigator.clipboard.readText = async () => {
            if (window.unreadable)
              throw new DOMException('Read permission denied.', 'NotAllowedError');
            return window.clipboardText;
          };
          localStorage.removeItem('ghostfetch.clipboard');
        });
        // Allowed, but the browser gives nothing, before this page has ever read the clipboard
        // (Chrome 121, or a clipboard it's told to keep to itself): p puts the yank at once, and
        // says so. (Taken for the read right after the dialog, it would put nothing there, however
        // often p was pressed.)
        await app.evaluate(() => {
          window.unreadable = true;
          document.hasFocus = () => true;
        });
        await setBody(VIM_START);
        await typeVim('jwwyiwP');
        await said();
        const unread = await state();
        // Right after the browser's dialog, which took the focus, Chrome gives nothing yet: p
        // says to press it again and puts nothing, the once. A page that still isn't given the
        // clipboard gets the yank from then on.
        await app.evaluate(() => {
          document.hasFocus = () => false;
        });
        await typeVim('p');
        await said();
        const pressAgain = await state();
        await typeVim('p');
        await said();
        const afterAgain = await state();
        expect(
          [unread, pressAgain, afterAgain],
          [
            [
              '{|  "namename": "Ada",|  "role": "admin",',
              "Couldn't read the clipboard",
              [1, null],
            ],
            [
              '{|  "namename": "Ada",|  "role": "admin",',
              'Clipboard allowed: press p again',
              [2, null],
            ],
            [
              '{|  "namenamename": "Ada",|  "role": "admin",',
              "Couldn't read the clipboard",
              [3, null],
            ],
          ],
        );
        await app.evaluate(() => {
          window.unreadable = false;
          window.asked = 0;
          delete document.hasFocus;
        });
        await setBody(VIM_START);
        // Copied in another app: a whole line, which p puts under the cursor's.
        await app.evaluate(() => {
          window.clipboardText = '  "copied": true,\n';
        });
        await typeVim('p');
        await app.waitForFunction(() =>
          document.querySelector('.code textarea').value.includes('"copied"'),
        );
        const allowed = await state();
        // Yanked, then turned down: p puts the yank, and says why it didn't read the clipboard.
        await typeVim('u');
        await setBody(VIM_START);
        await app.evaluate(() => {
          window.allow = false;
        });
        await typeVim('jwwyiwP');
        await app.waitForFunction(
          () => document.querySelector('.code-vim-keys').textContent,
        );
        const declined = await state();
        // p again doesn't ask, and puts the yank at once.
        await typeVim('p');
        const again = await state();
        await app.evaluate(() => {
          window.allow = true;
        });
        await typeVim(':set clipboard=unnamedplus<CR>');
        await app.waitForFunction(
          () =>
            document.querySelector('.code-vim-keys').textContent ===
            'p pastes the clipboard',
        );
        const asked = await state();
        expect(
          [allowed, declined, again, asked],
          [
            ['{|  "copied": true,|  "name": "Ada",', '', [1, null]],
            [
              '{|  "namename": "Ada",|  "role": "admin",',
              'Clipboard not allowed: p puts your yank',
              [2, '1'],
            ],
            ['{|  "namenamename": "Ada",|  "role": "admin",', '', [2, '1']],
            [
              '{|  "namenamename": "Ada",|  "role": "admin",',
              'p pastes the clipboard',
              [3, null],
            ],
          ],
        );
      } finally {
        await app.evaluate(() => {
          if (window.realRequest) chrome.permissions.request = window.realRequest;
          delete navigator.clipboard.writeText;
          delete navigator.clipboard.readText;
          delete document.hasFocus;
          localStorage.removeItem('ghostfetch.clipboard');
        });
        await setBody(VIM_START);
      }
    },
  );
  await check(
    "Wrap: a long line on as many rows as it takes, the textarea, the colours and the line numbers wrapped alike at any width and text size with nothing to scroll sideways, a mistake's mark and vim's block on their characters, an edit changing only its own line's row, and a row of many tokens that only just fits breaking where the textarea breaks it; off, a row a line again",
    async () => {
      const before = await body.inputValue();
      const wrap = app.locator('[data-testid="wrap"]');
      const measure = () => app.evaluate(wrapLayout);
      // Three frames on: the editor lays its rows out again the frame after its width changes.
      const drawn = () =>
        app.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
            ),
        );
      const lineCount = WRAP_BODY.split('\n').length;
      const seen = [];
      const edits = [];
      let edge;
      try {
        await wrap.click();
        await setBody(WRAP_BODY);
        await app.waitForSelector('.code-error');
        // Vim's block at the end of a line that wraps, then deep in the token's.
        await typeVim('gg3j$');
        seen.push(await measure());
        await typeVim('j0120l');
        seen.push(await measure());
        // Narrower, and a bigger text size: the rows wrap anew, the cursor and the mark with them.
        await app.setViewportSize({ width: 1000, height: 820 });
        await sleep(300);
        seen.push(await measure());
        await app.keyboard.press('ControlOrMeta+=');
        await sleep(300);
        seen.push(await measure());
        await app.keyboard.press('ControlOrMeta+0');
        await app.setViewportSize({ width: 1280, height: 820 });
        await sleep(300);
        // An edit that keeps the number of lines changes its line's row where it is, and a new
        // line adds a row: no other row goes or comes. (A row put in or taken out has the browser
        // count every row's number again, which in a body of 20,000 lines took 170 ms a key.)
        // The rows there are, how many of them were there before, the first that wasn't, and
        // whether the second line's row has its text.
        const rows = () =>
          app.evaluate(() => {
            const all = [...document.querySelectorAll('.code-row')];
            const second = document.querySelector('.code textarea').value.split('\n')[1];
            return [
              all.length,
              all.filter((row) => row.wasThere).length,
              all.findIndex((row) => !row.wasThere),
              all[1].textContent === second,
            ];
          });
        await app.evaluate(() => {
          for (const row of document.querySelectorAll('.code-row')) row.wasThere = true;
        });
        await typeVim('ggjix<Esc>');
        edits.push(await rows());
        await typeVim('o<Esc>');
        edits.push(await rows());
        // A width a whisker past a whole number of characters: a row that just fits as plain
        // text, as the textarea has it, doesn't once it's cut into tokens, which Chromium measures
        // one by one and rounds up. The editor keeps the width its text wraps at half a character
        // clear of that, so the coloured rows break where the textarea's do.
        await setBody(WRAP_TOKENS);
        await drawn();
        const { room, character } = await app.evaluate(wrapRoom);
        await app.evaluate(
          narrowEditor,
          room - (Math.floor(room / character) - 3) * character - 0.1,
        );
        await drawn();
        edge = {
          ...(await app.evaluate(wrapRoom)),
          ...(await app.evaluate(wrapBreaks)),
          rows: (await measure()).rows,
        };
        await app.evaluate(narrowEditor, 0);
        await setBody(WRAP_BODY);
        await app.waitForSelector('.code-error');
        // Off: a row a line, scrolled sideways, and the plain numbers.
        await wrap.click();
        await sleep(200);
        seen.push({
          ...(await measure()),
          numbers: (await app.textContent('.code-lines')).startsWith('1\n2\n3'),
        });
      } finally {
        await app.evaluate(narrowEditor, 0);
        if ((await wrap.getAttribute('aria-pressed')) === 'true') await wrap.click();
        await setBody(before);
      }
      expect(
        [
          ...seen
            .slice(0, 4)
            .map(({ wrapped: on, stored, sideways, rows, starts, block, mark }) => [
              on,
              stored,
              sideways,
              rowsAgree(rows),
              starts,
              block,
              mark,
            ]),
          edits,
          // The width the editor was given, past a whole number of characters; the width its text
          // wraps at, likewise; the rows that break somewhere else in the coloured layer; and that
          // there were rows to break, the same number in the textarea.
          [
            Math.round((edge.room % edge.character) * 10) / 10,
            Math.round(((edge.wraps / edge.character) % 1) * 100) / 100,
            edge.astray,
            edge.breaks > 10,
            rowsAgree(edge.rows),
          ],
          [seen[4].wrapped, seen[4].stored, seen[4].sideways > 0, seen[4].numbers],
        ],
        [
          ...Array.from({ length: 4 }, () => [true, '1', 0, true, true, true, true]),
          [
            [lineCount, lineCount, -1, true],
            [lineCount + 1, lineCount, 2, true],
          ],
          [0.1, 0.5, 0, true, true],
          [false, null, true, true],
        ],
      );
    },
  );
  await check(
    'the Vim switch is remembered after a reload; off gives the plain editor back',
    async () => {
      await app.reload();
      await app.waitForSelector('[data-testid="rule"]');
      await app.locator('[data-testid="rule"]').first().click();
      expect(
        [
          await vimSwitch.getAttribute('aria-pressed'),
          await app.locator('.code-vim').isVisible(),
        ],
        ['true', true],
      );
      await vimSwitch.click();
      expect(
        [
          await vimSwitch.getAttribute('aria-pressed'),
          await app.locator('.code-vim').isHidden(),
          await app.locator('.code-cursor .cursor').count(),
        ],
        ['false', true, 0],
      );
      await body.fill('{"ui": true}');
      expect(await body.inputValue(), '{"ui": true}');
    },
  );

  // How many times each of the editor's functions ran while `action` did, by name: V8's exact call
  // counts (precise coverage). The build isn't minified, so a component is counted by its name each
  // time it draws.
  const editorSession = await context.newCDPSession(app);
  // The same in another page, by its CDP session (a popup's).
  const drawsIn = async (session, action) => {
    await session.send('Profiler.enable');
    await session.send('Profiler.startPreciseCoverage', {
      callCount: true,
      detailed: false,
    });
    await session.send('Profiler.takePreciseCoverage');
    await action();
    const { result } = await session.send('Profiler.takePreciseCoverage');
    await session.send('Profiler.stopPreciseCoverage');
    const counts = {};
    for (const script of result) {
      if (!script.url.includes('/chunks/')) continue;
      for (const fn of script.functions)
        if (fn.functionName)
          counts[fn.functionName] =
            (counts[fn.functionName] ?? 0) + (fn.ranges[0]?.count ?? 0);
    }
    return counts;
  };
  const draws = (action) => drawsIn(editorSession, action);
  await check(
    'a request in the watched tab draws its count again, not the editor and its rules',
    async () => {
      // Up to 0.20.0 the count was the editor's own state: each request drew it whole, every
      // rule's row in the sidebar included.
      const traffic = app.locator('[data-testid="nav-traffic"]');
      const before = await traffic.textContent();
      const counts = await draws(async () => {
        for (const n of [1, 2, 3]) await call(`/api/draws?n=${n}`);
        await app.waitForFunction(
          (was) =>
            document.querySelector('[data-testid="nav-traffic"]').textContent !== was,
          before,
          { timeout: 3000 },
        );
        await sleep(300);
      });
      expect(
        [
          (counts.TrafficRow ?? 0) > 0,
          counts.Editor ?? 0,
          counts.Sidebar ?? 0,
          counts.RuleListItem ?? 0,
        ],
        [true, 0, 0, 0],
        `drawn: TrafficRow ${counts.TrafficRow}, Editor ${counts.Editor}, Sidebar ${counts.Sidebar}, RuleListItem ${counts.RuleListItem}`,
      );
    },
  );
  await check(
    "typing in a rule's name draws its row in the list again, and none of the others",
    async () => {
      // Up to 0.20.0 every rule's row drew again on each keystroke in any rule.
      const row = app.locator('[data-testid="rule"]').first();
      await row.click();
      const name = app.locator('[data-testid="rule-name"]');
      const was = await name.inputValue();
      const counts = await draws(async () => {
        await name.click();
        await app.keyboard.press('End');
        await app.keyboard.type('xyz', { delay: 40 });
        await sleep(100);
      });
      const title = await row.locator('[data-slot="item-title"]').textContent();
      await name.fill(was);
      const rows = await app.locator('[data-testid="rule"]').count();
      expect(
        [title, (counts.RuleListItem ?? 0) >= 1 && counts.RuleListItem <= 3],
        [`${was}xyz`.trim(), true],
        `${counts.RuleListItem} rows drawn, of ${rows}`,
      );
    },
  );

  // A rule's row: its slot (ItemSlot), which says what the rule did on the page the editor watches
  // and when, or under the pointer has the row's actions; and its name, which steps back for a
  // rule that's on but hasn't answered there. Three rules at the top of the list for these checks,
  // and the list as it was after them: one that answers /api/slot-check, one that's on but nothing
  // asks for, and one that's off. The rule open since the check before stays open.
  const SLOT = '/api/slot-check';
  const NEVER = '/api/slot-never';
  const OFF = '/api/slot-off';
  const slotRule = (url, name, enabled = true) => {
    const rule = createRule();
    Object.assign(rule, { name, enabled });
    rule.match.url = url;
    rule.response.body = '{"slot":true}';
    return rule;
  };
  const SLOT_RULES = [
    slotRule(SLOT, 'Slot check'),
    slotRule(NEVER, 'Never asked for'),
    slotRule(OFF, 'Switched off', false),
  ];
  const ruleRow = (url) => app.locator(`[data-testid="rule"][data-url="${url}"]`);
  // What the open rule matches, or null with none open, read at once.
  const openNow = () =>
    app.evaluate(
      () =>
        document.querySelector('[data-testid="rule"][data-selected]')?.dataset.url ??
        null,
    );
  // A row's first line: what its slot says, the parts out of sight left out; how opaque that and
  // the slot's actions are; where its name and its slot stand; and the name's weight and colour.
  // The editor's, and the popup's (readLine).
  const readLine = (row) => {
    const part = (slot) => row.querySelector(`[data-slot="${slot}"]`);
    const box = (element) => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return [left, right, top, bottom].map((edge) => Math.round(edge));
    };
    const status = part('item-status');
    const bottom = status.getBoundingClientRect().bottom;
    const name = getComputedStyle(part('item-title'));
    return {
      says: [...status.children]
        .filter((said) => said.getBoundingClientRect().top < bottom - 1)
        .map((said) => said.textContent)
        .join(' '),
      status: getComputedStyle(status).opacity,
      actions: getComputedStyle(part('item-slot-actions')).opacity,
      name: box(part('item-title')),
      slot: box(part('item-slot')),
      weight: name.fontWeight,
      colour: name.color,
    };
  };
  const lineOf = (url) => ruleRow(url).evaluate(readLine);
  // The theme's text colours by the kit's names, as a probe with each class draws them, in the
  // editor or another view.
  const textColours = (view = app) =>
    view.evaluate(() =>
      Object.fromEntries(
        ['strong', 't65', 't50', 'signal'].map((name) => {
          const probe = document.createElement('span');
          probe.className = `text-${name}`;
          document.body.append(probe);
          const colour = getComputedStyle(probe).color;
          probe.remove();
          return [name, colour];
        }),
      ),
    );
  // What `read` gives once `done` says so, or what it gives after 3 s.
  const rowSettled = async (read, done) => {
    const end = Date.now() + 3000;
    for (;;) {
      const value = await read();
      if (done(value) || Date.now() > end) return value;
      await sleep(50);
    }
  };
  const slotStored = async (url) =>
    (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules.find(
      (rule) => rule.match.url === url,
    );
  const { rules: beforeSlot } = await worker.evaluate(() =>
    chrome.storage.local.get('rules'),
  );
  await setStorage({ rules: [...SLOT_RULES, ...beforeSlot] });
  await ruleRow(OFF).waitFor({ timeout: 3000 });
  const openUrl = await openNow();
  // What each check after the first starts from, whatever the one before it left: the three rules
  // at the top of the list as they were made (the same ids, so what they did on the page still
  // counts), and the rule that was open open.
  const slotsReady = async () => {
    const { rules } = await worker.evaluate(() => chrome.storage.local.get('rules'));
    const top = rules.slice(0, 3).map(({ id, enabled }) => `${id} ${enabled}`);
    if (`${top}` !== `${SLOT_RULES.map(({ id, enabled }) => `${id} ${enabled}`)}`) {
      const mine = new Set(SLOT_RULES.map(({ id }) => id));
      await setStorage({
        rules: [...SLOT_RULES, ...rules.filter(({ id }) => !mine.has(id))],
      });
      await ruleRow(SLOT).waitFor({ timeout: 3000 });
    }
    if ((await openNow()) !== openUrl) {
      await ruleRow(openUrl).click();
      await rowSettled(openNow, (url) => url === openUrl);
    }
  };

  await check(
    'a rule\'s row says at its right end what the rule did on the page and when, once it has answered there: "1 mocked · now", the count in green and the time in grey; the request draws the row\'s first line again (RuleLine), not the row',
    async () => {
      const before = (await lineOf(SLOT)).says;
      const counts = await draws(async () => {
        await call(SLOT);
        await ruleRow(SLOT)
          .locator('[data-testid="rule-time"]')
          .waitFor({ timeout: 3000 });
        await sleep(200);
      });
      const theme = await textColours();
      const drawn = await ruleRow(SLOT).evaluate((row) =>
        ['rule-signal', 'rule-time'].map(
          (id) => getComputedStyle(row.querySelector(`[data-testid="${id}"]`)).color,
        ),
      );
      expect(
        [
          before,
          (await lineOf(SLOT)).says,
          drawn,
          counts.RuleListItem ?? 0,
          (counts.RuleLine ?? 0) > 0,
        ],
        ['', '1 mocked · now', [theme.signal, theme.t50], 0, true],
        `drawn: RuleLine ${counts.RuleLine}, RuleTime ${counts.RuleTime}, RuleListItem ${counts.RuleListItem}`,
      );
    },
  );
  await check(
    "under the pointer a row's slot shows its actions where it said what the rule did, and nothing in the row moves; its Turn off turns the rule off and Turn on back on, without opening it, and a press on its ⋯ moved away drags nothing",
    async () => {
      await slotsReady();
      await app.mouse.move(1, 1);
      const rest = await lineOf(SLOT);
      await ruleRow(SLOT).hover();
      const shown = await rowSettled(
        () => lineOf(SLOT),
        (line) => line.actions === '1' && line.status === '0',
      );
      const turn = ruleRow(SLOT).locator('[data-testid="row-switch"]');
      const labels = [await turn.getAttribute('aria-label')];
      await turn.click();
      const off = (
        await rowSettled(
          () => slotStored(SLOT),
          (rule) => !rule.enabled,
        )
      ).enabled;
      labels.push(await turn.getAttribute('aria-label'));
      await turn.click();
      const on = (
        await rowSettled(
          () => slotStored(SLOT),
          (rule) => rule.enabled,
        )
      ).enabled;
      // The ⋯ pressed, the pointer moved 120 px left over the row's name, and let go: no drag
      // starts (the row is draggable), though the press opens its menu.
      await app.evaluate(() => {
        window.slotDrags = 0;
        document.addEventListener('dragstart', () => (window.slotDrags += 1), true);
      });
      const at = await ruleRow(SLOT).locator('[data-testid="row-menu"]').boundingBox();
      await app.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await app.mouse.down();
      await app.mouse.move(at.x - 120, at.y + at.height / 2, { steps: 8 });
      await app.mouse.up();
      const drags = await app.evaluate(() => window.slotDrags);
      if (await app.locator('[data-slot="dropdown-menu-content"]').count())
        await app.keyboard.press('Escape');
      const order = (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules
        .slice(0, 3)
        .map((rule) => rule.match.url);
      expect(
        [
          [rest.status, rest.actions],
          [shown.status, shown.actions, shown.name, shown.slot],
          labels,
          [off, on],
          drags,
          order,
          await openNow(),
        ],
        [
          ['1', '0'],
          ['0', '1', rest.name, rest.slot],
          ['Turn off “Slot check”', 'Turn on “Slot check”'],
          [false, true],
          0,
          [SLOT, NEVER, OFF],
          openUrl,
        ],
      );
    },
  );
  await check(
    "a row's ⋯ has the open rule's menu, item for item, and the row's actions stay while it's open; its Delete deletes that rule, the open one staying open, and Undo puts it back",
    async () => {
      await slotsReady();
      // The open menu's items, once it's there; and the menu shut.
      const menu = app.locator('[data-slot="dropdown-menu-content"]');
      const items = async () => {
        await menu.locator('[role^="menuitem"]').first().waitFor({ timeout: 3000 });
        return menu.locator('[role^="menuitem"]').allTextContents();
      };
      await app.click('[data-testid="rule-menu"]');
      const header = await items();
      await app.keyboard.press('Escape');
      await menu.waitFor({ state: 'detached', timeout: 3000 });
      await ruleRow(SLOT).hover();
      await ruleRow(SLOT).locator('[data-testid="row-menu"]').click();
      const row = await items();
      // The pointer away from the row, over the open rule.
      await app.mouse.move(900, 700);
      await sleep(300);
      const whileOpen = await lineOf(SLOT);
      await app.click('[data-testid="delete-rule"]');
      await ruleRow(SLOT).waitFor({ state: 'detached', timeout: 3000 });
      const gone = await ruleRow(SLOT).count();
      const stayed = await openNow();
      await app.click('[data-slot="toast"] button:has-text("Undo")');
      await ruleRow(SLOT).waitFor({ timeout: 3000 });
      expect(
        [
          row,
          [whileOpen.status, whileOpen.actions],
          gone,
          stayed,
          await openNow(),
          await ruleRow(SLOT).getAttribute('data-selected'),
        ],
        [header, ['0', '1'], 0, openUrl, openUrl, null],
        `the open rule's menu: ${header.join(', ')}`,
      );
    },
  );
  await check(
    "a rule that's on but hasn't answered on the page steps back, its name at normal weight in a quieter grey; one that answered, and the open one, stay at medium weight in the text colour, and one that's off fades as before; while Recording is off, none steps back",
    async () => {
      await slotsReady();
      const theme = await textColours();
      const look = async (url) => {
        const { weight, colour } = await lineOf(url);
        return [weight, colour];
      };
      const seen = async () => [
        await look(SLOT),
        await look(NEVER),
        await look(OFF),
        await look(openUrl),
      ];
      const recording = await seen();
      await setStorage({ record: false });
      const notRecording = await rowSettled(seen, (rows) => rows[1][0] === '500');
      await setStorage({ record: true });
      const again = await rowSettled(seen, (rows) => rows[1][0] === '400');
      // Opened, the rule that hasn't answered stands out as well.
      await ruleRow(NEVER).click();
      const opened = await rowSettled(
        () => look(NEVER),
        ([weight]) => weight === '500',
      );
      await ruleRow(openUrl).click();
      await rowSettled(openNow, (url) => url === openUrl);
      const BRIGHT = ['500', theme.strong];
      const QUIET = ['400', theme.t65];
      const FADED = ['500', theme.t50];
      expect(
        [recording, notRecording, again, opened],
        [
          [BRIGHT, QUIET, FADED, BRIGHT],
          [BRIGHT, BRIGHT, FADED, BRIGHT],
          [BRIGHT, QUIET, FADED, BRIGHT],
          BRIGHT,
        ],
      );
    },
  );
  await check(
    "in Commit Mono at Larger, nothing in a rule's row reaches past its edge: in a 420 px panel its slot says it all, and beside an open rule, where the sidebar is narrow, what it says gives way, the time first, then the count, as the name keeps 7 letters' room",
    async () => {
      // The rows that say what their rule did: whether the slot ends inside the row's padding and
      // nothing in the row overflows it; whether the name has 7 letters' room, or 60% of the line;
      // and each part of what the slot says, whole, cut, or out of sight.
      const rows = () =>
        app.evaluate(() =>
          [...document.querySelectorAll('[data-testid="rule"]')]
            .filter((row) => row.querySelector('[data-testid="rule-signal"]'))
            .map((row) => {
              const edge =
                row.getBoundingClientRect().right -
                parseFloat(getComputedStyle(row).paddingRight);
              const slot = row
                .querySelector('[data-slot="item-slot"]')
                .getBoundingClientRect();
              const title = row.querySelector('[data-slot="item-title"]');
              const line = title.parentElement.getBoundingClientRect().width;
              const em = parseFloat(getComputedStyle(title).fontSize);
              const status = row.querySelector('[data-slot="item-status"]');
              const bottom = status.getBoundingClientRect().bottom;
              return {
                inside: slot.right <= edge + 0.5 && row.scrollWidth <= row.clientWidth,
                room:
                  title.getBoundingClientRect().width >=
                  Math.min(7 * em, 0.6 * line) - 0.5,
                says: [...status.children].map((said) =>
                  said.getBoundingClientRect().top >= bottom - 1
                    ? 'gone'
                    : said.scrollWidth > said.clientWidth
                      ? 'cut'
                      : 'whole',
                ),
              };
            }),
        );
      // The time goes first, then the count: what the slot may say.
      const GIVES_WAY = ['whole,whole', 'whole,gone', 'cut,gone'];
      await slotsReady();
      try {
        await app.evaluate(() =>
          Object.assign(document.documentElement.dataset, {
            font: 'mono',
            size: 'larger',
          }),
        );
        await app.setViewportSize({ width: 420, height: 760 });
        // In a narrow panel the list is a screen of its own once the open rule is closed.
        await app.locator('[data-testid="rule-back"]').click({ timeout: 3000 });
        await ruleRow(SLOT).waitFor({ state: 'visible' });
        await app.evaluate(() => document.fonts.ready);
        const narrow = await rows();
        await app.setViewportSize({ width: 1280, height: 820 });
        await ruleRow(openUrl).click();
        await app.evaluate(() => document.fonts.ready);
        const beside = await rows();
        expect(
          [
            narrow.length > 0,
            narrow.every(
              (row) => row.inside && row.room && `${row.says}` === 'whole,whole',
            ),
            beside.every(
              (row) => row.inside && row.room && GIVES_WAY.includes(`${row.says}`),
            ),
            beside.some((row) => row.says[1] === 'gone'),
          ],
          [true, true, true, true],
          JSON.stringify({ narrow, beside }),
        );
      } finally {
        await app.evaluate(() => {
          delete document.documentElement.dataset.font;
          delete document.documentElement.dataset.size;
        });
        await app.setViewportSize({ width: 1280, height: 820 });
        if ((await openNow()) !== openUrl) await ruleRow(openUrl).click();
      }
    },
  );
  // The list as a tree, for the keyboard and a screen reader: one Tab stop, the arrow keys, F2,
  // and the right-click menu, on the three rules above and a group of two rules after them, Keys.
  const { groups: beforeGroups = [] } = await worker.evaluate(() =>
    chrome.storage.local.get('groups'),
  );
  const KEYS = createGroup('Keys');
  const K1 = '/api/key-one';
  const K2 = '/api/key-two';
  const KEY_RULES = [K1, K2].map((url, index) =>
    Object.assign(slotRule(url, `Key ${index ? 'two' : 'one'}`), { group: KEYS.id }),
  );
  const keysItem = app.locator(`[data-testid="group-block"][data-item="${KEYS.id}"]`);
  // What has focus: a rule's row (what it matches), a group's item ("group: " its name), or else
  // what it's called.
  const focusedItem = () =>
    app.evaluate(() => {
      const active = document.activeElement;
      if (!active?.matches('[role="treeitem"]'))
        return `not an item: ${active?.getAttribute('aria-label') ?? active?.tagName}`;
      return active.dataset.testid === 'group-block'
        ? `group: ${active.querySelector('[data-testid="group"]').dataset.group}`
        : active.dataset.url;
    });
  // The role and the name Chromium gives the element `selector` finds, as a screen reader gets: in
  // the editor, or in another page by its CDP session.
  const axOf = async (selector, session = editorSession) => {
    const { root } = await session.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    const { nodes } = await session.send('Accessibility.getPartialAXTree', {
      nodeId,
      fetchRelatives: false,
    });
    return [nodes[0]?.role?.value, nodes[0]?.name?.value];
  };
  // What each of these checks starts from, whatever the one before left: the three rules and Keys
  // with its two as they were made, Keys unfolded, and the rule that was open open.
  const keysReady = async () => {
    const stored = await worker.evaluate(() =>
      chrome.storage.local.get(['rules', 'groups']),
    );
    const made = [...SLOT_RULES, ...KEY_RULES];
    const kept = (list) =>
      list
        .map(({ id, name, enabled, group }) => `${id} ${name} ${enabled} ${group}`)
        .join();
    const keys = stored.groups?.find(({ id }) => id === KEYS.id);
    if (
      kept(stored.rules.slice(0, made.length)) !== kept(made) ||
      keys?.name !== 'Keys' ||
      !keys.enabled
    ) {
      const mine = new Set(made.map(({ id }) => id));
      await setStorage({
        rules: [...made, ...stored.rules.filter(({ id }) => !mine.has(id))],
        groups: [
          { ...KEYS, at: 3 },
          ...(stored.groups ?? []).filter(({ id }) => id !== KEYS.id),
        ],
      });
      await app.locator(`[data-item="${KEY_RULES[1].id}"]`).waitFor({ timeout: 3000 });
    }
    if ((await keysItem.getAttribute('aria-expanded')) === 'false')
      await keysItem.locator('[data-testid="group-name"]').click();
    if ((await openNow()) !== openUrl) {
      await ruleRow(openUrl).click();
      await rowSettled(openNow, (url) => url === openUrl);
    }
  };

  await check(
    "the rule list is a tree that's one Tab stop: Tab from the button before it lands on the open rule's row, then that row's Turn off and ⋯, then out of the list, no other row's controls being Tab stops; each item says its level and its place among its own, a group whether it's expanded, the open rule that it's selected; a screen reader names a row by its rule's name and a group by its own",
    async () => {
      await keysReady();
      const tree = await app.evaluate(() => {
        const list = document.querySelector('[role="tree"]');
        const label = (item) =>
          item.dataset.testid === 'group-block'
            ? `group: ${item.querySelector('[data-testid="group"]').dataset.group}`
            : item.dataset.url;
        const items = [...list.querySelectorAll('[role="treeitem"]')];
        return {
          name: list.getAttribute('aria-label'),
          top: [...list.children].filter((child) => child.matches('[role="treeitem"]'))
            .length,
          first: items
            .slice(0, 7)
            .map((item) => [
              label(item),
              ...['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map(
                (name) => item.getAttribute(name),
              ),
            ]),
          selected: items
            .filter((item) => item.getAttribute('aria-selected') === 'true')
            .map(label),
          group:
            list.querySelector('[role="group"]').closest('[role="treeitem"]') ===
            items[3],
          stops: [...list.querySelectorAll('*')]
            .filter((element) => element.tabIndex >= 0)
            .map((element) =>
              element.matches('[role="treeitem"]')
                ? label(element)
                : element.getAttribute('aria-label'),
            ),
        };
      });
      const title = await ruleRow(openUrl)
        .locator('[data-slot="item-title"]')
        .textContent();
      // Tab from the button before the list, four times.
      await app.locator('[data-testid="new-rule"]').focus();
      const tabs = [];
      for (let time = 0; time < 4; time++) {
        await app.keyboard.press('Tab');
        tabs.push(await focusedItem());
      }
      const left = await app.evaluate(
        () => !document.activeElement?.closest('[role="tree"]'),
      );
      const named = [
        await axOf(`[data-testid="rule"][data-url="${SLOT}"]`),
        await axOf(`[data-testid="group-block"][data-item="${KEYS.id}"]`),
      ];
      const top = `${tree.top}`;
      expect(
        [tree.name, tree.first.slice(0, 6), tree.first[6].slice(1, 3), tree.selected],
        [
          'Rules',
          [
            [SLOT, '1', '1', top, null],
            [NEVER, '1', '2', top, null],
            [OFF, '1', '3', top, null],
            ['group: Keys', '1', '4', top, 'true'],
            [K1, '2', '1', '2', null],
            [K2, '2', '2', '2', null],
          ],
          ['1', '5'],
          [openUrl],
        ],
        'the tree',
      );
      expect(
        [tree.group, tree.stops, tabs.slice(0, 3), left, named],
        [
          true,
          [openUrl, `Turn off “${title}”`, `More actions for “${title}”`],
          [
            openUrl,
            `not an item: Turn off “${title}”`,
            `not an item: More actions for “${title}”`,
          ],
          true,
          [
            ['treeitem', 'Slot check'],
            ['treeitem', 'Keys'],
          ],
        ],
        'Tab, and the names',
      );
    },
  );
  await check(
    '↑ ↓ move between the rows and the group\'s header, passing a folded group\'s rules, Home and End to the first and the last; → unfolds a group or goes to its first rule, ← folds it or goes from a rule to its group; Space and Enter fold and unfold a group, and Enter or Space on a rule opens it; "/" from a row goes to the search field',
    async () => {
      await keysReady();
      const items = () =>
        app.evaluate(() =>
          [...document.querySelectorAll('[role="treeitem"]')].map((item) =>
            item.dataset.testid === 'group-block'
              ? `group: ${item.querySelector('[data-testid="group"]').dataset.group}`
              : item.dataset.url,
          ),
        );
      const all = await items();
      const rest = all[6];
      const last = all.at(-1);
      await ruleRow(openUrl).focus();
      // Each key, and the item focus is on after it, with whether Keys is expanded.
      const seen = [];
      const press = async (key) => {
        await app.keyboard.press(key);
        seen.push([
          key,
          await focusedItem(),
          await keysItem.getAttribute('aria-expanded'),
        ]);
      };
      for (const key of [
        'Home',
        'ArrowDown',
        'ArrowDown',
        'ArrowDown',
        'ArrowDown',
        'ArrowDown',
        'ArrowLeft',
        'ArrowLeft',
        'ArrowDown',
        'ArrowUp',
        'ArrowRight',
        'ArrowRight',
        'End',
        'Home',
        'ArrowUp',
      ])
        await press(key);
      // Space and Enter on the group's item.
      await keysItem.focus();
      await press('Space');
      await press('Enter');
      // Enter on a rule's row opens it, and so does Space on another.
      await ruleRow(NEVER).focus();
      await app.keyboard.press('Enter');
      const enter = await rowSettled(openNow, (url) => url === NEVER);
      await ruleRow(OFF).focus();
      await app.keyboard.press('Space');
      const space = await rowSettled(openNow, (url) => url === OFF);
      // "/" from a row.
      await ruleRow(SLOT).focus();
      await app.keyboard.press('/');
      const slash = await app.evaluate(() =>
        document.activeElement?.getAttribute('aria-label'),
      );
      const G = 'group: Keys';
      expect(
        [seen, enter, space, slash],
        [
          [
            ['Home', SLOT, 'true'],
            ['ArrowDown', NEVER, 'true'],
            ['ArrowDown', OFF, 'true'],
            ['ArrowDown', G, 'true'],
            ['ArrowDown', K1, 'true'],
            ['ArrowDown', K2, 'true'],
            ['ArrowLeft', G, 'true'],
            ['ArrowLeft', G, 'false'],
            ['ArrowDown', rest, 'false'],
            ['ArrowUp', G, 'false'],
            ['ArrowRight', G, 'true'],
            ['ArrowRight', K1, 'true'],
            ['End', last, 'true'],
            ['Home', SLOT, 'true'],
            ['ArrowUp', SLOT, 'true'],
            ['Space', G, 'false'],
            ['Enter', G, 'true'],
          ],
          NEVER,
          OFF,
          'Search rules',
        ],
      );
    },
  );
  await check(
    "F2 makes a rule's name a field in its row: Enter keeps the name typed and gives the row focus back, Esc keeps the old name, an empty name is refused, leaving the field keeps what's typed; F2 on a group's item renames the group the same way",
    async () => {
      await keysReady();
      const field = app.locator('[data-testid="rule-name-input"]');
      const stored = () => slotStored(NEVER).then((rule) => rule.name);
      // F2, the field's words typed over (they're selected), and a key to end it.
      const rename = async (typed, end) => {
        await ruleRow(NEVER).focus();
        await app.keyboard.press('F2');
        await field.waitFor({ timeout: 3000 });
        const shown = [
          await field.inputValue(),
          await field.evaluate((input) => input === document.activeElement),
        ];
        if (typed === '') await app.keyboard.press('Backspace');
        else await app.keyboard.type(typed);
        await app.keyboard.press(end);
        await field.waitFor({ state: 'detached', timeout: 3000 });
        return shown;
      };
      const opened = await rename('Renamed by F2', 'Enter');
      const kept = await rowSettled(stored, (name) => name === 'Renamed by F2');
      const back = await rowSettled(focusedItem, (item) => item === NEVER);
      await rename('Not this', 'Escape');
      await sleep(400);
      const escaped = [await stored(), await focusedItem()];
      await rename('', 'Enter');
      await sleep(400);
      const empty = await stored();
      // Typed, then the pointer elsewhere: the field's left, and keeps it.
      await ruleRow(NEVER).focus();
      await app.keyboard.press('F2');
      await field.waitFor({ timeout: 3000 });
      await app.keyboard.type('Kept on leaving');
      await app.locator('[data-testid="rule-list"] h2').click();
      await field.waitFor({ state: 'detached', timeout: 3000 });
      const left = await rowSettled(stored, (name) => name === 'Kept on leaving');
      // The group, by F2 on its item.
      await keysItem.focus();
      await app.keyboard.press('F2');
      const groupField = app.locator('[data-testid="group-name-input"]');
      await groupField.waitFor({ timeout: 3000 });
      await app.keyboard.type('Keys again');
      await app.keyboard.press('Enter');
      await groupField.waitFor({ state: 'detached', timeout: 3000 });
      const group = await rowSettled(
        async () =>
          (await worker.evaluate(() => chrome.storage.local.get('groups'))).groups.find(
            ({ id }) => id === KEYS.id,
          ).name,
        (name) => name === 'Keys again',
      );
      const groupBack = await rowSettled(
        focusedItem,
        (item) => item === 'group: Keys again',
      );
      expect(
        [opened, kept, back, escaped, empty, left, group, groupBack],
        [
          ['Never asked for', true],
          'Renamed by F2',
          NEVER,
          ['Renamed by F2', NEVER],
          'Renamed by F2',
          'Kept on leaving',
          'Keys again',
          'group: Keys again',
        ],
      );
    },
  );
  await check(
    "a right-click on a rule's row opens its menu at the pointer, with its ⋯'s items, and on a group's header the group's ⋯'s; the ContextMenu key and Shift+F10 open the focused item's at its bottom left (a group's header's), Esc giving it focus back",
    async () => {
      await keysReady();
      const menu = app.locator('[data-slot="context-menu-content"]');
      const dropdown = app.locator('[data-slot="dropdown-menu-content"]');
      const itemsOf = async (popup) => {
        await popup.locator('[role^="menuitem"]').first().waitFor({ timeout: 3000 });
        return popup.locator('[role^="menuitem"]').allTextContents();
      };
      const shut = async (popup) => {
        await app.keyboard.press('Escape');
        await popup.waitFor({ state: 'detached', timeout: 3000 });
      };
      const near = async (point) => {
        const box = await menu.boundingBox();
        return Boolean(box) && Math.hypot(box.x - point[0], box.y - point[1]) <= 12;
      };
      const corner = async (locator) => {
        const box = await locator.boundingBox();
        return [box.x, box.y + box.height];
      };
      const middle = async (locator) => {
        const box = await locator.boundingBox();
        return [box.x + box.width / 2, box.y + box.height / 2];
      };
      // The ⋯ menus' items: the open rule's, and the group's.
      await app.click('[data-testid="rule-menu"]');
      const ruleItems = await itemsOf(dropdown);
      await shut(dropdown);
      await keysItem.locator('[data-testid="group-menu"]').click();
      const groupItems = await itemsOf(dropdown);
      await shut(dropdown);
      // The pointer's right-click on a rule's row and on the group's header.
      const onRow = await middle(ruleRow(SLOT));
      await app.mouse.click(...onRow, { button: 'right' });
      const rightRule = [await itemsOf(menu), await near(onRow)];
      await shut(menu);
      const header = keysItem.locator('[data-testid="group"]');
      const onHeader = await middle(header);
      await app.mouse.click(...onHeader, { button: 'right' });
      const rightGroup = [await itemsOf(menu), await near(onHeader)];
      await shut(menu);
      // The keys on the focused items.
      await ruleRow(SLOT).focus();
      await app.keyboard.press('ContextMenu');
      const keyRule = [await itemsOf(menu), await near(await corner(ruleRow(SLOT)))];
      await shut(menu);
      const keyBack = await rowSettled(focusedItem, (item) => item === SLOT);
      await keysItem.focus();
      await app.keyboard.press('Shift+F10');
      const keyGroup = [await itemsOf(menu), await near(await corner(header))];
      await shut(menu);
      const groupBack = await rowSettled(focusedItem, (item) => item === 'group: Keys');
      expect(
        [rightRule, rightGroup, keyRule, keyBack, keyGroup, groupBack],
        [
          [ruleItems, true],
          [groupItems, true],
          [ruleItems, true],
          SLOT,
          [groupItems, true],
          'group: Keys',
        ],
        `a rule's: ${ruleItems.join(', ')}; a group's: ${groupItems.join(', ')}`,
      );
    },
  );
  await check(
    "a rule's right-click menu's items work: Duplicate opens a copy, Move to group moves it into Keys and No group out again, Export this rule saves it, Delete deletes it with the open rule staying open and Undo puts it back; a group's: Rename makes its name a field, Duplicate copies it, Export group saves it, Ungroup leaves its rules where it was, Delete deletes it and Undo puts it back",
    async () => {
      await keysReady();
      const menu = app.locator('[data-slot="context-menu-content"]');
      const rightClick = async (locator) => {
        await locator.click({ button: 'right', position: { x: 60, y: 12 } });
        await menu.locator('[role^="menuitem"]').first().waitFor({ timeout: 3000 });
      };
      const pick = async (text) => {
        await menu.locator('[role^="menuitem"]', { hasText: text }).first().click();
        await menu.waitFor({ state: 'detached', timeout: 3000 });
      };
      const undo = () => app.click('[data-slot="toast"] button:has-text("Undo")');
      const groupOf = (locator) =>
        locator.evaluate(
          (row) =>
            row.parentElement
              .closest('[data-testid="group-block"]')
              ?.querySelector('[data-testid="group"]').dataset.group ?? '',
        );
      const download = async (locator, text) => {
        await rightClick(locator);
        const [saved] = await Promise.all([app.waitForEvent('download'), pick(text)]);
        return JSON.parse(fs.readFileSync(await saved.path(), 'utf8'));
      };
      // A rule's: Duplicate, on Never asked for.
      await rightClick(ruleRow(NEVER));
      await pick('Duplicate');
      await app
        .locator(`[data-testid="rule"][data-url="${NEVER}"]`)
        .nth(1)
        .waitFor({ timeout: 3000 });
      const duplicated = [
        await app.locator(`[data-testid="rule"][data-url="${NEVER}"]`).count(),
        await openNow(),
      ];
      // Delete, on the copy, which is open: it closes, and Undo opens it again; then it's gone.
      const copy = app.locator(
        `[data-testid="rule"][data-url="${NEVER}"][data-selected]`,
      );
      await rightClick(copy);
      await pick('Delete');
      const deletedOpen = [
        await app.locator(`[data-testid="rule"][data-url="${NEVER}"]`).count(),
        await openNow(),
      ];
      await undo();
      await copy.waitFor({ timeout: 3000 });
      await rightClick(copy);
      await pick('Delete');
      await keysReady();
      // Move to group: into Keys, then out of it.
      await rightClick(ruleRow(SLOT));
      await menu.locator('[data-testid="move-to-group"]').click();
      await app.click('[data-testid="move-to"][data-group="Keys"]');
      await menu.waitFor({ state: 'detached', timeout: 3000 });
      const movedIn = await groupOf(ruleRow(SLOT));
      await rightClick(ruleRow(SLOT));
      await menu.locator('[data-testid="move-to-group"]').click();
      await app.click('[data-testid="move-to-none"]');
      await menu.waitFor({ state: 'detached', timeout: 3000 });
      const movedOut = await groupOf(ruleRow(SLOT));
      await keysReady();
      // Export this rule, and Delete on a rule that isn't open.
      const exportedRule = await download(ruleRow(OFF), 'Export this rule');
      await rightClick(ruleRow(OFF));
      await pick('Delete');
      const deleted = [await ruleRow(OFF).count(), await openNow()];
      await undo();
      await ruleRow(OFF).waitFor({ timeout: 3000 });
      // The group's: Rename, Duplicate (its copy's name a field to type in), Export group.
      const header = keysItem.locator('[data-testid="group"]');
      const groupField = app.locator('[data-testid="group-name-input"]');
      await rightClick(header);
      await pick('Rename');
      await groupField.waitFor({ timeout: 3000 });
      await sleep(200);
      // Still there a moment later: the menu, shutting, doesn't take its focus away.
      const renameField = [await groupField.inputValue()];
      await app.keyboard.press('Escape');
      await groupField.waitFor({ state: 'detached', timeout: 3000 });
      await rightClick(header);
      await pick('Duplicate');
      await groupField.waitFor({ timeout: 3000 });
      const copied = await groupField.inputValue();
      await app.keyboard.press('Escape');
      const copyHeader = app.locator(`[data-testid="group"][data-group="${copied}"]`);
      await rightClick(copyHeader);
      await pick('Delete');
      await copyHeader.waitFor({ state: 'detached', timeout: 3000 });
      const exportedGroup = await download(header, 'Export group');
      // Ungroup, then Keys again; Delete, and Undo.
      await rightClick(header);
      await pick('Ungroup');
      const ungrouped = [await keysItem.count(), await groupOf(ruleRow(K1))];
      await keysReady();
      await rightClick(header);
      await pick('Delete');
      const gone = [await keysItem.count(), await ruleRow(K1).count()];
      await undo();
      await keysItem.waitFor({ timeout: 3000 });
      const back = [await groupOf(ruleRow(K1)), await groupOf(ruleRow(K2))];
      // The toasts of the two deletes not undone, shut, for the checks after this one.
      for (const close of await app
        .locator('[data-slot="toast"] button[aria-label="Close"]')
        .all())
        await close.click();
      await rowSettled(
        () => app.locator('[data-slot="toast"]').count(),
        (count) => count === 0,
      );
      expect(
        [
          duplicated,
          deletedOpen,
          [movedIn, movedOut],
          exportedRule.rules.map(({ name }) => name),
          deleted,
          renameField,
          copied,
          [
            exportedGroup.groups.map(({ name }) => name),
            exportedGroup.rules.map(({ name }) => name),
          ],
          ungrouped,
          gone,
          back,
        ],
        [
          [2, NEVER],
          [1, null],
          ['Keys', ''],
          ['Switched off'],
          [0, openUrl],
          ['Keys'],
          'Keys copy',
          [['Keys'], ['Key one', 'Key two']],
          [0, ''],
          [0, 0],
          ['Keys', 'Keys'],
        ],
      );
    },
  );
  await check(
    "a text field in the list, and text selected in a row, keep the browser's own menu: a right-click in a rule's name field while it's renamed, or on selected text, opens none of ours and leaves the browser's, which a right-click elsewhere on a row doesn't",
    async () => {
      await keysReady();
      const menu = app.locator('[data-slot="context-menu-content"]');
      await app.evaluate(() => {
        window.menusKept = [];
        addEventListener(
          'contextmenu',
          (event) => setTimeout(() => window.menusKept.push(event.defaultPrevented)),
          true,
        );
      });
      // In the field F2 makes.
      await ruleRow(NEVER).focus();
      await app.keyboard.press('F2');
      const field = app.locator('[data-testid="rule-name-input"]');
      await field.waitFor({ timeout: 3000 });
      await field.click({ button: 'right' });
      await sleep(300);
      const inField = await menu.count();
      await app.keyboard.press('Escape');
      await field.waitFor({ state: 'detached', timeout: 3000 });
      // On text selected in a row, then on the row with none selected.
      const title = ruleRow(SLOT).locator('[data-slot="item-title"]');
      await title.evaluate((element) => getSelection().selectAllChildren(element));
      await title.click({ button: 'right' });
      await sleep(300);
      const onSelection = await menu.count();
      await title.evaluate(() => getSelection().removeAllRanges());
      await app.keyboard.press('Escape');
      await title.click({ button: 'right' });
      await menu.waitFor({ timeout: 3000 });
      await app.keyboard.press('Escape');
      await menu.waitFor({ state: 'detached', timeout: 3000 });
      await sleep(100);
      expect(
        [inField, onSelection, await app.evaluate(() => window.menusKept)],
        [0, 0, [false, false, true]],
      );
    },
  );
  await setStorage({ rules: beforeSlot, groups: beforeGroups });
  await ruleRow(SLOT).waitFor({ state: 'detached', timeout: 3000 });
  // Folding Keys and unfolding it left the folds' key behind (an empty list): gone again, as the
  // editor's settings are checked by name further on.
  await app.evaluate(() => localStorage.removeItem('ghostfetch.folded'));

  await check('delete with undo', async () => {
    const before = await app.locator('[data-testid="rule"]').count();
    await app.click('[data-testid="rule-menu"]');
    await app.click('[data-testid="delete-rule"]');
    expect(await app.locator('[data-testid="rule"]').count(), before - 1);
    await app.click('[data-slot="toast"] button:has-text("Undo")');
    expect(await app.locator('[data-testid="rule"]').count(), before);
  });
  await check('traffic view shows captured requests live', async () => {
    await show('traffic');
    await app.waitForSelector('[data-testid="request"]', { timeout: 5000 });
    await call('/api/user?case=live-check');
    await app.waitForSelector(
      '[data-testid="request-path"]:text("/api/user?case=live-check")',
      { timeout: 3000 },
    );
    const badges = await app
      .locator('[data-testid="request"] [data-testid="request-action"]')
      .allTextContents();
    for (const label of ['Mocked', 'Modified', 'Rule error']) {
      if (!badges.includes(label))
        throw new Error(`no "${label}" entry; saw ${[...new Set(badges)].join(', ')}`);
    }
  });
  await check(
    "a request the page gave up on before a rule answered is listed as aborted, under the rule's name, and isn't the rule's error",
    async () => {
      // As a rule's error it would count in the rule's "failed 2×", which with React's StrictMode
      // is every mocked request in development: one aborted, then one answered. The rule's own
      // count, "fired 3×", goes up by the one it answered.
      const fired = async () => {
        const state = await app.locator('[data-testid="rule-state"]').textContent();
        const [, count] = /^Mocking · fired (\d+)× on /.exec(state) ?? [];
        if (!count) throw new Error(`the rule says "${state}"`);
        return Number(count);
      };
      await app.locator('[data-testid="rule"][data-url="/api/early"]').click();
      const before = await fired();
      await page.evaluate(async () => {
        const controller = new AbortController();
        const pending = fetch('/api/early?gave-up=1', { signal: controller.signal });
        controller.abort();
        await pending.catch(() => {});
        await (await fetch('/api/early?gave-up=0')).text();
      });
      await show('traffic');
      const gaveUp = app.locator('[data-testid="request"]', { hasText: 'gave-up=1' });
      await gaveUp.waitFor({ timeout: 3000 });
      await app
        .locator('[data-testid="request"]', { hasText: 'gave-up=0' })
        .waitFor({ timeout: 3000 });
      const row = [
        await gaveUp.locator('[data-slot="status"]').textContent(),
        await gaveUp.locator('[data-testid="request-action"]').count(),
        // Under its path, why it failed and the rule it was under. Up to 0.20.1 a failed request
        // said only where it went ("127.0.0.1:… · fetch()"), its reason left to the drawer.
        await gaveUp
          .locator('[data-testid="request-path"]')
          .locator('xpath=following-sibling::span[1]')
          .textContent(),
      ];
      await gaveUp.click();
      const detail = app.locator('[data-testid="request-detail"]');
      const said = [
        await detail.locator('[role="alert"]').textContent(),
        (await detail.locator('dt:text-is("Rule") + dd').textContent()).replace(
          /\s+/g,
          ' ',
        ),
      ];
      // The rule itself: it answered once more, and failed at nothing.
      await detail.locator('[data-testid="open-rule"]').click();
      const answered = (await fired()) - before;
      await show('traffic');
      expect(
        [row, said, answered],
        [['ERR', 0, 'Aborted · /api/early'], ['Aborted', '/api/earlyOpen'], 1],
      );
    },
  );
  if (SHOTS) {
    await app
      .locator('[data-testid="request"]', { hasText: 'case=merge' })
      .first()
      .click();
    await app.screenshot({ path: `${SHOTS}/wide-traffic.png` });
  }
  await check(
    "a request's Sent time is when the page sent it, not when its response ended",
    async () => {
      // Up to 0.20.1 a request was logged with the time its response had all arrived: one that
      // took 2.5 s showed as sent 2.5 s after it was.
      const sentAt = await page.evaluate(async () => {
        const at = Date.now();
        await (await fetch('/api/slow?ms=2500&sent=1')).text();
        return at;
      });
      const row = app.locator('[data-testid="request"]', { hasText: 'sent=1' });
      await row.waitFor({ timeout: 3000 });
      await row.click();
      const shown = await app
        .locator('[data-testid="request-detail"] dt:text-is("Sent") + dd')
        .textContent();
      await app.locator('[data-testid="request-back"]').click();
      // To the second, as the drawer shows it: the request went out within a second of sentAt.
      const at = (ms) => app.evaluate((time) => new Date(time).toLocaleTimeString(), ms);
      const sent = [await at(sentAt), await at(sentAt + 1000)];
      if (!sent.includes(shown))
        throw new Error(
          `sent at ${sent[0]}, shown as ${shown}, which is when its response ended (${await at(sentAt + 2500)})`,
        );
    },
  );
  await check(
    'an open request\'s Copy URL, Copy as cURL and Copy body each copy and say so in the button ("Copied", a polite live region saying what), with no toast; a copy the browser refuses shows the error toast, saying what to do, and leaves the button as it was',
    async () => {
      // Up to 0.26.0 a copy said so in a toast at the corner, over the list in a side panel.
      const url = `${ORIGIN}/api/user?case=live-check`;
      await app
        .locator('[data-testid="request"]', { hasText: 'case=live-check' })
        .first()
        .click();
      // What the page writes to the clipboard, kept as it's written: the clipboard is the
      // browser's own (the kit check reads it back).
      await app.evaluate(() => {
        window.copiedTexts = [];
        navigator.clipboard.writeText = async (text) => {
          window.copiedTexts.push(text);
        };
      });
      const said = [];
      for (const testid of ['copy-url', 'copy-curl', 'copy-body']) {
        await app.click(`[data-testid="${testid}"]`);
        await app.waitForSelector(`[data-testid="${testid}"][data-copied]`);
        said.push(
          await app
            .locator(`[data-testid="${testid}"]`)
            .evaluate((button) => [
              getComputedStyle(button.querySelector('[data-part=copied]')).opacity,
              button.nextElementSibling.getAttribute('aria-live'),
              button.nextElementSibling.textContent,
            ]),
        );
      }
      const copied = await app.evaluate(() => window.copiedTexts);
      const toasted = await app
        .locator('[data-slot="toast"]', { hasText: /cop(y|ied)/i })
        .count();
      // Refused, as Firefox's sidebar does without the focus, once Copy URL says its words again.
      await app.evaluate(() => {
        navigator.clipboard.writeText = () =>
          Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'));
      });
      await app.waitForSelector('[data-testid="copy-url"]:not([data-copied])');
      await app.click('[data-testid="copy-url"]');
      const toast = app.locator('[data-slot="toast"]', {
        hasText: "Couldn't copy the URL",
      });
      await toast.waitFor({ timeout: 3000 });
      await sleep(200);
      const refused = [
        await toast.textContent(),
        await app
          .locator('[data-testid="copy-url"]')
          .evaluate((button) => [
            button.hasAttribute('data-copied'),
            button.nextElementSibling.textContent,
          ]),
      ];
      await app.evaluate(() => delete navigator.clipboard.writeText);
      await app.locator('[data-testid="request-back"]').click();
      expect(
        [
          said,
          copied[0],
          copied[1],
          JSON.parse(copied[2]).name,
          copied[2].includes('\n'),
          toasted,
          refused,
        ],
        [
          [
            ['1', 'polite', 'Copied the URL'],
            ['1', 'polite', 'Copied the cURL command'],
            ['1', 'polite', 'Copied the response body'],
          ],
          url,
          curlCommand({ method: 'GET', url, body: '' }),
          'Real',
          true,
          0,
          [
            "Couldn't copy the URLThe browser didn't let Ghostfetch use the clipboard. Click in Ghostfetch, then copy again.",
            [false, ''],
          ],
        ],
      );
    },
  );
  await check('"Mock this response" turns a request into a rule', async () => {
    await app
      .locator('[data-testid="request"]', { hasText: 'case=live-check' })
      .first()
      .click();
    await app.click('[data-testid="mock"]');
    await app.waitForSelector('[data-testid="view-rules"]:not([hidden])');
    // It opens on the body it captured, and the URL row shows the request's path.
    expect(
      [
        JSON.parse(await body.inputValue()).name,
        await app.locator('[data-testid="row-url-value"]').textContent(),
      ],
      ['Real', '/api/user?case=live-check'],
    );
    await body.fill('{"fromTraffic": true}');
    await sleep(500);
    expect((await call('/api/user?case=live-check')).body, { fromTraffic: true });
  });
  // The server's answer to /api/user (test/fixtures.mjs), as a rule made from it keeps it, and the
  // body of that rule edited: the name changed, a tag added. +3 −2.
  const REAL = formatJson(
    JSON.stringify({
      id: 1,
      name: 'Real',
      role: 'user',
      profile: { city: 'Riga', age: 30 },
      tags: ['a', 'b'],
    }),
  );
  const EDITED = REAL.replace('"Real"', '"Mocked"').replace('"b"', '"b",\n    "c"');
  // The rules, and the servers' responses Diff keeps, each under a key of its own, by rule id.
  const inStorage = () =>
    worker.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const serverResponses = {};
      for (const [key, value] of Object.entries(all))
        if (key.startsWith('serverResponse:'))
          serverResponses[key.slice('serverResponse:'.length)] = value;
      return { rules: all.rules, serverResponses };
    });
  const diffView = app.locator('[data-testid="diff"]');
  // Diff off: by its switch if it shows (a rule with no response has none, nor one that keeps
  // the server's body), and remembered off for the next body that opens.
  const diffOff = async () => {
    const toggle = app.locator('[data-testid="diff-switch"]');
    if ((await toggle.count()) && (await toggle.getAttribute('aria-pressed')) === 'true')
      await toggle.click();
    await app.evaluate(() => localStorage.setItem('ghostfetch.diff', '0'));
  };
  // A Diff check leaves Diff off, even one that fails half way, so the next finds the editor.
  const diffCheck = (name, run) =>
    check(name, async () => {
      try {
        await run();
      } finally {
        await diffOff();
      }
    });
  const diffCounts = async () =>
    (await app.locator('[data-testid="diff-counts"]').innerText()).replace(/\s+/g, ' ');
  // Diff's layout, its counts and how many rows are drawn, and whether the editor shows.
  const diffState = async () => ({
    layout: await diffView.getAttribute('data-layout'),
    counts: await diffCounts(),
    rows: await app.locator('[data-testid="diff-row"]').count(),
    editor: await body.isVisible(),
  });
  // A rule that's off, with a body of its own; a server's response as Diff keeps it.
  const draftRule = (
    id,
    name,
    url,
    text = '{\n  "name": "Mine"\n}',
    contentType = 'application/json',
  ) => ({
    id,
    name,
    enabled: false,
    match: { url, mode: 'contains', method: 'ANY', graphqlOperation: '' },
    response: {
      bodyMode: 'replace',
      body: text,
      status: '',
      delay: 0,
      contentType,
      headers: [],
    },
    createdAt: 1,
    updatedAt: 1,
  });
  const keptResponse = (text) => ({
    body: text,
    status: 200,
    time: Date.now(),
    truncated: false,
  });
  // The rules as they were before a check, without the ones it made or their responses; Diff off
  // first, while the rule it shows is still there, so the next check finds it off.
  const restoreRules = async (rules) => {
    await diffOff();
    await worker.evaluate(async (wanted) => {
      const ids = new Set(wanted.map((rule) => rule.id));
      const all = await chrome.storage.local.get(null);
      await chrome.storage.local.remove(
        Object.keys(all).filter(
          (key) =>
            key.startsWith('serverResponse:') &&
            !ids.has(key.slice('serverResponse:'.length)),
        ),
      );
      await chrome.storage.local.set({ rules: wanted });
    }, rules);
  };
  // A check's own rules, each with the server's response its Diff compares with ([rule, body]
  // pairs); what it returns puts the rules back.
  const addRules = async (made) => {
    const { rules } = await inStorage();
    await worker.evaluate((values) => chrome.storage.local.set(values), {
      rules: [...rules, ...made.map(([rule]) => rule)],
      ...Object.fromEntries(
        made.map(([rule, response]) => [
          `serverResponse:${rule.id}`,
          keptResponse(response),
        ]),
      ),
    });
    return () => restoreRules(rules);
  };
  // Where the body editor's cursor is (its line and column, from 0), and whether Diff shows.
  const caret = () =>
    body.evaluate((textarea) => {
      const before = textarea.value.slice(0, textarea.selectionStart);
      return {
        diff: Boolean(document.querySelector('[data-testid="diff"]')),
        line: before.split('\n').length - 1,
        column: before.length - before.lastIndexOf('\n') - 1,
      };
    });
  // A point on character `index` of a Diff line's text: its left quarter, so the caret goes
  // before it.
  const charPoint = (code, index) =>
    code.evaluate((element, at) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let left = at;
      while (node && left >= node.length) {
        left -= node.length;
        node = walker.nextNode();
      }
      const range = document.createRange();
      range.setStart(node, left);
      range.setEnd(node, left + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 4, y: rect.top + rect.height / 2 };
    }, index);
  await diffCheck(
    "Diff: Mock this response keeps the server's response apart from the rule (and out of an export), and Diff shows what the body changes in it: side by side, inline, and inline in a narrow panel",
    async () => {
      await body.fill(EDITED);
      await sleep(400);
      const { rules, serverResponses } = await inStorage();
      const made = rules.find((rule) => rule.match.url === '/api/user?case=live-check');
      const kept = serverResponses[made.id];
      const lines = diffLines(REAL, EDITED);
      await app.click('[data-testid="diff-switch"]');
      await diffView.waitFor();
      const wide = await diffState();
      await app.click('[data-testid="diff-inline"]');
      const inline = await diffState();
      await app.setViewportSize({ width: 400, height: 760 });
      await app.waitForFunction(
        () => !document.querySelector('[data-testid="diff-split"]'),
      );
      const narrow = await diffState();
      await app.setViewportSize({ width: 1280, height: 820 });
      await app.click('[data-testid="diff-split"]');
      await app.click('[data-testid="rule-menu"]');
      const [download] = await Promise.all([
        app.waitForEvent('download'),
        app.click('text=Export this rule'),
      ]);
      const exported = fs.readFileSync(await download.path(), 'utf8');
      await app.click('[data-testid="diff-switch"]');
      expect(
        [
          [kept.status, kept.body === REAL],
          JSON.stringify(made).includes('Real'),
          [lines.added, lines.removed, lines.lines.length],
          wide,
          inline,
          narrow,
          [
            JSON.parse(exported).rules[0].response.body === EDITED,
            exported.includes('Real'),
          ],
          await body.isVisible(),
        ],
        [
          [200, true],
          false,
          [3, 2, 16],
          { layout: 'split', counts: '+3 −2', rows: 28, editor: false },
          { layout: 'inline', counts: '+3 −2', rows: 16, editor: false },
          { layout: 'inline', counts: '+3 −2', rows: 16, editor: false },
          [true, false],
          true,
        ],
      );
    },
  );
  await diffCheck(
    "Diff can't be typed in and says so, Turn Diff off goes back to the body; a click on a line puts the cursor where it was clicked, on a removed line at the start of the body's next line, and Enter at the top",
    async () => {
      const at = () =>
        body.evaluate((textarea) => {
          const { value, selectionStart: start } = textarea;
          return {
            at: `${value.slice(start - 3, start)}|${value.slice(start, start + 3)}`,
            focused: document.activeElement === textarea,
          };
        });
      await app.click('[data-testid="diff-switch"]');
      await app.click('[data-testid="diff-inline"]');
      const pane = app.locator('[data-testid="diff-pane"]');
      await pane.focus();
      await app.keyboard.type('q');
      const note = await app.locator('[data-testid="diff-note"]').innerText();
      await app.click('[data-testid="diff-off"]');
      const off = [await body.isVisible(), (await at()).focused, await body.inputValue()];
      // On the c of "Mocked": the left quarter of the character, so the caret goes before it.
      await app.click('[data-testid="diff-switch"]');
      const added = app.locator('[data-testid="diff-row"][data-kind="add"] [data-code]', {
        hasText: '"Mocked"',
      });
      const box = await added.boundingBox();
      const text = await added.innerText();
      const width = (box.width - 24) / text.length;
      await app.mouse.click(
        box.x + width * (text.indexOf('Mocked') + 2.25),
        box.y + box.height / 2,
      );
      const clicked = [await diffView.count(), await at()];
      await app.click('[data-testid="diff-switch"]');
      await app
        .locator('[data-testid="diff-row"][data-kind="del"]', { hasText: '"Real"' })
        .click();
      const removed = await at();
      await app.click('[data-testid="diff-switch"]');
      await pane.focus();
      await app.keyboard.press('Enter');
      const entered = [await diffView.count(), await at()];
      expect(
        [
          note.startsWith("Diff is on, so the body can't be typed in."),
          off,
          clicked,
          removed,
          entered,
        ],
        [
          true,
          [true, true, EDITED],
          [0, { at: '"Mo|cke', focused: true }],
          { at: '1,\n|  "', focused: true },
          [0, { at: '|{\n ', focused: true }],
        ],
      );
    },
  );
  await diffCheck(
    "Diff: a rule with no server's response gets the next one the page shows it while it's off; a copy keeps it; Keep server's body has no Diff switch, nor a rule with no response yet",
    async () => {
      const before = (await inStorage()).rules;
      try {
        await worker.evaluate(
          (rules) => chrome.storage.local.set({ rules }),
          [
            ...before,
            draftRule('capture-test', 'Captured', '/api/user?case=capture'),
            draftRule('none-test', 'No response', '/api/never-called'),
          ],
        );
        await call('/api/user?case=capture');
        // The editor keeps it as the request shows up in its log.
        let captured;
        for (let tries = 0; !captured && tries < 50; tries++) {
          await sleep(100);
          captured = (await inStorage()).serverResponses['capture-test'];
        }
        if (!captured)
          throw new Error("the editor kept no response for the rule that's off");
        await app
          .locator('[data-testid="rule"]', { hasText: 'Captured' })
          .first()
          .click();
        await app.click('[data-testid="diff-switch"]');
        await diffView.waitFor();
        const from = await app.locator('[data-testid="diff-from"]').innerText();
        // Keep server's body: no body of yours to compare, so no Diff switch.
        await app.click('[data-testid="body-original"]');
        const kept = await app.locator('[data-testid="diff-switch"]').count();
        await app.click('[data-testid="body-replace"]');
        await app.click('[data-testid="duplicate-rule"]');
        await sleep(400);
        const after = await inStorage();
        const copy = after.rules.find((rule) => rule.name === 'Captured (copy)');
        // No response yet: no Diff switch and no Diff, though Diff is on; the body in the editor.
        await app
          .locator('[data-testid="rule"]', { hasText: 'No response' })
          .first()
          .click();
        await body.waitFor();
        const none = [
          await app.locator('[data-testid="diff-switch"]').count(),
          await diffView.count(),
          await body.isEditable(),
        ];
        expect(
          [
            [captured.status, captured.body === REAL],
            from.endsWith(' · 200'),
            kept,
            after.serverResponses[copy.id]?.body === REAL,
            none,
          ],
          [[200, true], true, 0, true, [0, 0, true]],
        );
      } finally {
        await restoreRules(before);
      }
    },
  );
  await diffCheck(
    'Diff of a body of 390,000 characters opens in good time and draws only the lines on screen, the last ones too once scrolled there',
    async () => {
      // The rule Mock this response made, open again: the check before took its own rules away.
      await app
        .locator('[data-testid="rule"]', { hasText: 'case=live-check' })
        .first()
        .click();
      await body.waitFor();
      const { rules } = await inStorage();
      const made = rules.find((rule) => rule.match.url === '/api/user?case=live-check');
      const items = Array.from({ length: 5000 }, (_, id) => ({
        id,
        name: `item ${id}`,
        price: id * 1.5,
      }));
      const theirs = JSON.stringify({ items }, null, 2);
      items[2500].name = 'changed';
      items.push({ id: 5000, name: 'added', price: 0 });
      const yours = JSON.stringify({ items }, null, 2);
      await worker.evaluate((values) => chrome.storage.local.set(values), {
        [`serverResponse:${made.id}`]: keptResponse(theirs),
      });
      // On one line, which a fill puts in at once, then formatted: filled in as 25,000 lines, it
      // would take Chrome minutes.
      await body.fill(JSON.stringify({ items }));
      await app.click('[data-testid="format"]');
      await app.waitForFunction(
        () => document.querySelector('.code textarea').value.startsWith('{\n'),
        null,
        { timeout: 10_000 },
      );
      await sleep(400);
      const started = Date.now();
      await app.click('[data-testid="diff-switch"]');
      await app.locator('[data-testid="diff-counts"]').waitFor();
      const took = Date.now() - started;
      const counts = await diffCounts();
      const drawn = await app.locator('[data-testid="diff-row"]').count();
      // Inline, or side by side, whose panes scroll down together.
      await app
        .locator('[data-testid="diff-pane"], [data-testid="diff-pane-after"]')
        .first()
        .evaluate((pane) => pane.scrollTo(0, pane.scrollHeight));
      await app
        .locator('[data-testid="diff-row"]', { hasText: '"name": "added"' })
        .first()
        .waitFor({ timeout: 3000 });
      await app.click('[data-testid="diff-switch"]');
      await body.fill(EDITED);
      await sleep(400);
      if (took > 2000) throw new Error(`Diff took ${took} ms to open`);
      expect(
        [counts, yours.length > 390_000, drawn < 400],
        ['+6 −1', true, true],
        `${drawn} rows drawn`,
      );
    },
  );
  // A text body with Windows line ends, as Mock this response keeps one and makes a rule of: the
  // body editor has \n for each, as any textarea does.
  const WINDOWS = Array.from(
    { length: 40 },
    (_, i) => `row ${i + 1}: value ${i + 1}`,
  ).join('\r\n');
  await diffCheck(
    'Diff: a body with Windows line ends compares, and takes a click, as the body editor has it',
    async () => {
      const restore = await addRules([
        [
          draftRule(
            'crlf-test',
            'Windows line ends',
            '/api/never-called?crlf',
            WINDOWS,
            'text/plain',
          ),
          WINDOWS,
        ],
      ]);
      try {
        await app
          .locator('[data-testid="rule"]', { hasText: 'Windows line ends' })
          .first()
          .click();
        await app.click('[data-testid="diff-switch"]');
        await app.click('[data-testid="diff-inline"]');
        const same = await diffCounts();
        // Before the v of "value" on line 30.
        const row = app
          .locator('[data-testid="diff-row"]', { hasText: 'row 30: value 30' })
          .first();
        await row.scrollIntoViewIfNeeded();
        const point = await charPoint(row.locator('[data-code]'), 8);
        await app.mouse.click(point.x, point.y);
        const clicked = await caret();
        await app.keyboard.type('X');
        await sleep(400);
        await app.click('[data-testid="diff-switch"]');
        expect(
          [same, clicked, await diffCounts()],
          ['+0 −0', { diff: false, line: 29, column: 8 }, '+1 −1'],
        );
      } finally {
        await restore();
      }
    },
  );
  await diffCheck(
    "Diff: a click where a line's Edit here shows goes to the character under it, as anywhere else on the line",
    async () => {
      const long = `{\n  "about": "${'a long line '.repeat(20)}"\n}`;
      const restore = await addRules([
        [
          draftRule('label-test', 'A long line', '/api/never-called?label', long),
          '{\n  "about": "short"\n}',
        ],
      ]);
      try {
        await app
          .locator('[data-testid="rule"]', { hasText: 'A long line' })
          .first()
          .click();
        await app.click('[data-testid="diff-switch"]');
        await app.click('[data-testid="diff-split"]');
        const row = app.locator(
          '[data-testid="diff-pane-after"] [data-testid="diff-row"][data-kind="add"]',
        );
        // Over the start of the line, which shows Edit here at the right of the pane, over it.
        await row.locator('[data-code]').hover({ position: { x: 5, y: 5 } });
        const label = await row.locator('.diff-edit').boundingBox();
        // The character under the middle of the label, and a point on it that's on the label.
        const under = await row.locator('[data-code]').evaluate(
          (element, x) => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let index = 0;
            for (let node = walker.nextNode(); node; node = walker.nextNode())
              for (let offset = 0; offset < node.length; offset++, index++) {
                const range = document.createRange();
                range.setStart(node, offset);
                range.setEnd(node, offset + 1);
                const rect = range.getBoundingClientRect();
                if (rect.left <= x && x < rect.right)
                  return {
                    index,
                    x: rect.left + rect.width / 4,
                    y: rect.top + rect.height / 2,
                  };
              }
            return null;
          },
          label.x + label.width / 2,
        );
        if (!under) throw new Error('no character under Edit here');
        const onLabel =
          under.x >= label.x &&
          under.x <= label.x + label.width &&
          under.y >= label.y &&
          under.y <= label.y + label.height;
        await app.mouse.click(under.x, under.y);
        expect(
          [onLabel, await caret()],
          [true, { diff: false, line: 1, column: under.index }],
        );
      } finally {
        await restore();
      }
    },
  );
  await diffCheck(
    'Diff: switching between side by side and inline keeps the same lines on screen',
    async () => {
      // Every fourth name changed: inline has a row for each line removed and each added, side
      // by side one for each pair, so halfway down the same scroll would show other lines.
      const items = Array.from({ length: 300 }, (_, id) => ({ id, name: `item ${id}` }));
      const theirs = JSON.stringify({ items }, null, 2);
      for (let id = 0; id < 300; id += 4) items[id].name = `changed ${id}`;
      const restore = await addRules([
        [
          draftRule(
            'layout-test',
            'Many changes',
            '/api/never-called?layout',
            JSON.stringify({ items }, null, 2),
          ),
          theirs,
        ],
      ]);
      // The body's line at the top of Diff (from 1): the top row's, or the next of the body's.
      const topLine = () =>
        app.evaluate(() => {
          const pane = document.querySelector(
            '[data-testid="diff-pane"], [data-testid="diff-pane-after"]',
          );
          const inline = pane.dataset.testid === 'diff-pane';
          const rows = [...pane.querySelectorAll('[data-testid="diff-row"]')]
            .filter((row) => parseFloat(row.style.top) >= pane.scrollTop - 0.01)
            .toSorted((a, b) => Number(a.dataset.row) - Number(b.dataset.row));
          for (const row of rows) {
            const numbers = [...row.querySelectorAll('.diff-no')].map(
              (no) => no.textContent,
            );
            const line = inline ? numbers[1] : numbers[0];
            if (line) return Number(line);
          }
          return null;
        });
      try {
        await app
          .locator('[data-testid="rule"]', { hasText: 'Many changes' })
          .first()
          .click();
        await app.click('[data-testid="diff-switch"]');
        await app.click('[data-testid="diff-inline"]');
        await app.locator('[data-testid="diff-pane"]').evaluate((pane) => {
          pane.scrollTop = pane.scrollHeight / 2;
        });
        await sleep(200);
        const inline = await topLine();
        await app.click('[data-testid="diff-split"]');
        await sleep(200);
        const split = await topLine();
        await app.click('[data-testid="diff-inline"]');
        await sleep(200);
        expect([split, await topLine()], [inline, inline], 'the line at the top');
      } finally {
        await restore();
      }
    },
  );
  await diffCheck(
    "Diff: Mock this response on a request a rule answered keeps no server's response, as the server didn't send it",
    async () => {
      const before = (await inStorage()).rules;
      try {
        await worker.evaluate(
          (rules) => chrome.storage.local.set({ rules }),
          [
            ...before,
            {
              ...draftRule(
                'answers-test',
                'Answers',
                '/api/user?case=answered',
                '{\n  "name": "Answered by a rule"\n}',
              ),
              enabled: true,
            },
          ],
        );
        await sleep(400);
        await show('traffic');
        const got = (await call('/api/user?case=answered')).body;
        const answered = app
          .locator('[data-testid="request"]', { hasText: 'case=answered' })
          .first();
        await answered.click();
        const badge = await answered
          .locator('[data-testid="request-action"]')
          .textContent();
        await app.click('[data-testid="mock"]');
        await app.waitForSelector('[data-testid="view-rules"]:not([hidden])');
        await sleep(400);
        const after = await inStorage();
        const made = after.rules.find(
          (rule) =>
            rule.id !== 'answers-test' && !before.some(({ id }) => id === rule.id),
        );
        expect(
          [
            got.name,
            badge,
            made.response.body.includes('Answered by a rule'),
            after.serverResponses[made.id] ?? null,
          ],
          ['Answered by a rule', 'Mocked', true, null],
        );
      } finally {
        await restoreRules(before);
      }
    },
  );
  // The Diff and layout settings go, as each check's own settings do, for the checks after.
  await app.evaluate(() => {
    localStorage.removeItem('ghostfetch.diff');
    localStorage.removeItem('ghostfetch.diffLayout');
  });
  await check(
    'New rule reads a cURL command, a starter sets the answer, and a recent request is one click from a rule',
    async () => {
      const stored = async (url) =>
        (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules.find(
          (rule) => rule.match.url === url,
        );
      const remove = async () => {
        await app.click('[data-testid="rule-menu"]');
        await app.click('[data-testid="delete-rule"]');
      };
      await app.click('[data-testid="new-rule"]');
      await app.waitForFunction(
        () => document.activeElement?.dataset.testid === 'composer-input',
        null,
        { timeout: 3000 },
      );
      // As Chrome's Copy as cURL writes it, over three lines.
      await app.fill(
        '[data-testid="composer-input"]',
        `curl '${ORIGIN}/api/user?case=composer' \\\n  -X 'POST' \\\n  -H 'accept: text/plain'`,
      );
      await app.click('[data-testid="starter-missing"]');
      const picked = (name) =>
        app.locator(`[data-testid="picker-${name}"]`).textContent();
      expect(
        [
          await picked('method'),
          await picked('mode'),
          await picked('status'),
          await picked('delay'),
        ],
        ['POST', 'URL contains', '404 Not Found', 'No delay'],
      );
      await app.click('[data-testid="composer-submit"]');
      await app.waitForSelector('[data-testid="rule-name"]');
      await sleep(400);
      // The URL's path and query, so it answers on any host; the method and the Accept'ed type
      // from the command; the starter's status and body.
      const made = await stored('/api/user?case=composer');
      expect(
        [
          made.match.method,
          made.match.mode,
          made.response.status,
          made.response.body,
          made.response.contentType,
        ],
        ['POST', 'contains', '404', '{\n  "error": "Not Found"\n}', 'text/plain'],
      );
      const answer = await call('/api/user?case=composer', { method: 'POST' });
      expect([answer.status, answer.body], [404, { error: 'Not Found' }]);
      await remove();
      // A request no rule answered is offered under the input, and Mock makes a rule of it.
      await call('/api/user?case=recent');
      await app.click('[data-testid="new-rule"]');
      const recent = app.locator('[data-testid="recent-request"]', {
        hasText: 'case=recent',
      });
      await recent.waitFor({ timeout: 3000 });
      await recent.locator('[data-testid="recent-mock"]').click();
      await app.waitForSelector('[data-testid="rule-name"]');
      expect(
        await app.locator('[data-testid="row-url-value"]').textContent(),
        '/api/user?case=recent',
      );
      await remove();
    },
  );
  await check(
    'wide: the sidebar button and Cmd/Ctrl+B hide the sidebar beside a rule and in Traffic; it stays hidden after a reload; a narrow panel has no button',
    async () => {
      const key = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+b`;
      // The sidebar: its width, and whether it's drawn (it stays laid out while hidden).
      const sidebar = () =>
        app.evaluate(() => {
          const aside = document.querySelector('[data-testid="sidebar"]');
          return {
            width: Math.round(aside.getBoundingClientRect().width),
            shown: getComputedStyle(aside).visibility === 'visible',
          };
        });
      const settled = (shown) =>
        app.waitForFunction(
          (visible) => {
            const aside = document.querySelector('[data-testid="sidebar"]');
            const width = aside.getBoundingClientRect().width;
            return visible
              ? getComputedStyle(aside).visibility === 'visible' && width >= 260
              : getComputedStyle(aside).visibility === 'hidden' && width < 2;
          },
          shown,
          { timeout: 3000 },
        );
      const toggle = app.locator('[data-testid="sidebar-toggle"]:visible');
      const seen = [];
      await show('rules');
      await app.locator('[data-testid="rule"]').first().click();
      seen.push((await sidebar()).shown);
      await toggle.click();
      await settled(false);
      seen.push(await toggle.getAttribute('aria-expanded'));
      // The rule has the whole window.
      const pane = await app
        .locator('[data-testid="view-rules"] > section')
        .boundingBox();
      seen.push(pane.width > 1270);
      // Remembered: a reload opens with the sidebar hidden, beside New rule, which has the button
      // too.
      await app.reload();
      await app.waitForSelector('[data-testid="composer-input"]');
      await settled(false);
      await app.keyboard.press(key);
      await settled(true);
      seen.push((await sidebar()).shown);
      expect(seen, [true, 'false', true, true]);

      // Traffic: the same sidebar, and the button is in the bar over the list. Hidden, the list
      // has the whole window, and a request opens in a drawer beside it: 44% of the window, 12 px
      // from its right edge.
      await show('traffic');
      await app.locator('[data-testid="request"]').first().waitFor({ timeout: 5000 });
      const traffic = [(await sidebar()).shown];
      await toggle.click();
      await settled(false);
      const list = await app.locator('[data-testid="traffic-list"]').boundingBox();
      await app.locator('[data-testid="request"]').first().click();
      const drawer = await app.locator('[data-testid="request-detail"]').boundingBox();
      traffic.push(
        list.width > 1270,
        Math.abs(drawer.width - 1280 * 0.44) <= 1 &&
          Math.abs(drawer.x + drawer.width - 1268) <= 1,
      );
      await app.keyboard.press(key);
      await settled(true);
      traffic.push((await sidebar()).shown);
      await app.click('[data-testid="request-back"]');
      expect(traffic, [true, true, true, true], JSON.stringify({ list, drawer }));

      // A narrow panel shows the sidebar or what's open anyway: no button, and the key does
      // nothing.
      await show('rules');
      await app.setViewportSize({ width: 400, height: 760 });
      await app.keyboard.press(key);
      expect(
        [
          await app.locator('[data-testid="sidebar-toggle"]').first().isVisible(),
          await app.evaluate(() => localStorage.getItem('ghostfetch.sidebar')),
        ],
        [false, null],
      );
      await app.setViewportSize({ width: 1280, height: 820 });
    },
  );
  await check(
    "wide: dragging the sidebar's edge sizes it (at least 260 px, leaving 320), past half of that hides it and out again shows it; the width is one for both views, kept after a reload; the keys move it; a double-click gives the usual width back",
    async () => {
      const handle = () => app.locator('[data-testid="sidebar-handle"]');
      // The sidebar's width once its column has stopped sliding: 0 while it's hidden (its column
      // is shut, though its own border is still 1 px wide, and it only goes invisible once the
      // column has slid shut).
      const width = async () => {
        let last;
        for (let tries = 0; tries < 40; tries++) {
          const now = await app.evaluate(() => {
            const aside = document.querySelector('[data-testid="sidebar"]');
            const shown = Math.round(aside.getBoundingClientRect().width);
            return getComputedStyle(aside).visibility === 'visible' && shown > 1
              ? shown
              : 0;
          });
          if (now === last) return now;
          last = now;
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        return last;
      };
      const saved = () =>
        app.evaluate(() => localStorage.getItem('ghostfetch.sidebar-width'));
      // Takes the edge by its middle and lets go of it at `x` (whole pixels).
      const drag = async (x, { release = true } = {}) => {
        const box = await handle().boundingBox();
        const y = Math.round(box.y + box.height / 2);
        await app.mouse.move(Math.round(box.x + box.width / 2), y);
        await app.mouse.down();
        await app.mouse.move(x, y, { steps: 8 });
        if (release) await app.mouse.up();
      };
      const seen = [];
      await show('rules');
      await app.locator('[data-testid="rule"]').first().click();
      // The usual width: 272 px (a fifth of a wider window, at most 340).
      seen.push(await width());
      // While it's dragged, the columns follow the pointer instead of sliding.
      await drag(360, { release: false });
      seen.push(await app.locator('[data-testid="sidebar"][data-resizing]').count());
      await app.mouse.up();
      seen.push(await width(), await saved());
      await drag(150);
      seen.push(await width());
      await drag(1200);
      seen.push(await width());
      // Past half the narrowest: hidden, and the width from before this drag is kept for later.
      await drag(60);
      seen.push(
        await width(),
        await app
          .locator('[data-testid="sidebar-toggle"]:visible')
          .getAttribute('aria-expanded'),
        await saved(),
      );
      // The edge waits at the left; taken there (4 px into it), it brings the sidebar back.
      await drag(500);
      seen.push(await width());
      expect(seen, [272, 1, 360, '360', 260, 960, 0, 'false', '960', 496]);

      // One width for both views, remembered after a reload.
      await show('traffic');
      await app.locator('[data-testid="request"]').first().click();
      const traffic = [await width()];
      await drag(500);
      traffic.push(await width());
      await app.reload();
      await app.locator('[data-testid="request"]').first().waitFor({ timeout: 5000 });
      traffic.push(await width());
      await show('rules');
      traffic.push(await width());
      expect(traffic, [496, 500, 500, 500]);

      // The keys, with the edge focused, and what it says it is.
      await handle().focus();
      const keyed = [];
      for (const key of [
        'ArrowLeft',
        'Shift+ArrowRight',
        'Home',
        'End',
        'Enter',
        'Enter',
      ]) {
        await app.keyboard.press(key);
        const now = await width();
        keyed.push([key, now, await handle().getAttribute('aria-valuenow')]);
      }
      expect(keyed, [
        ['ArrowLeft', 484, '484'],
        ['Shift+ArrowRight', 548, '548'],
        ['Home', 260, '260'],
        ['End', 960, '960'],
        ['Enter', 0, '0'],
        ['Enter', 960, '960'],
      ]);

      // A double-click: the usual width again, and nothing kept.
      await handle().dblclick();
      expect([await width(), await saved()], [272, null]);
      // A narrow panel has no edge to drag.
      await app.setViewportSize({ width: 400, height: 760 });
      expect(await app.locator('[data-testid="sidebar-handle"]:visible').count(), 0);
      await app.setViewportSize({ width: 1280, height: 820 });
    },
  );
  await check(
    "wide: while the list's edge is dragged, the body's text area keeps its width and takes the new one when let go; the list's width isn't inherited, and the body's coloured text is as wide whatever the editor's width",
    async () => {
      // What lets a long body keep up with the drag (sidebar.tsx, list-detail.tsx and the body
      // editor's .code-text): none of it shows, so it's checked here.
      const sizes = () =>
        app.evaluate(() => {
          const pane = document.querySelector('[data-testid="sidebar"]');
          const textarea = document.querySelector('.code textarea');
          const round = (element) => Math.round(element.getBoundingClientRect().width);
          return {
            textarea: round(textarea),
            column: round(textarea.parentElement),
            text: round(document.querySelector('.code-highlight .code-text')),
            set: getComputedStyle(pane).getPropertyValue('--list-width') !== '',
            inherited: getComputedStyle(pane.firstElementChild).getPropertyValue(
              '--list-width',
            ),
          };
        });
      await show('rules');
      await app.locator('[data-testid="rule"]').first().click();
      const before = await sizes();
      const box = await app.locator('[data-testid="sidebar-handle"]').boundingBox();
      const y = Math.round(box.y + box.height / 2);
      await app.mouse.move(Math.round(box.x + box.width / 2), y);
      await app.mouse.down();
      await app.mouse.move(Math.round(box.x + box.width / 2) - 120, y, { steps: 6 });
      const during = await sizes();
      await app.mouse.up();
      const after = await sizes();
      await app.locator('[data-testid="sidebar-handle"]').dblclick();
      expect(
        [
          during.textarea === before.textarea,
          during.column !== before.column,
          during.set,
          during.inherited,
          after.textarea === after.column,
          after.text === before.text,
        ],
        [true, true, true, '', true, true],
        JSON.stringify({ before, during, after }),
      );
    },
  );
  await check('traffic reconnects after the page reloads', async () => {
    await show('traffic');
    await page.reload();
    await page.evaluate(() => window.early);
    // The old page's entries match too, so wait for the panel to swap to the new page's log.
    await app.waitForFunction(
      () => document.querySelectorAll('[data-testid="request"]').length === 1,
      null,
      { timeout: 5000 },
    );
    await app.waitForSelector('[data-testid="request-path"]:text("/api/early")', {
      timeout: 5000,
    });
    expect(await app.locator('[data-testid="request"]').count(), 1);
  });

  if (SHOTS) {
    await app.setViewportSize({ width: 400, height: 760 });
    await show('rules');
    await app.screenshot({ path: `${SHOTS}/narrow-editor.png` });
    await app.click('[data-testid="row-status"]');
    await app.screenshot({ path: `${SHOTS}/narrow-status.png` });
    await app.click('[data-testid="row-url"]');
    await app.screenshot({ path: `${SHOTS}/narrow-match.png` });
    await app.click('[data-testid="row-url"]');
    await body.scrollIntoViewIfNeeded();
    const before = await body.inputValue();
    // A longer body, with every kind of value, that fills the editor down to the pane's bottom.
    const user = (id) => ({
      id,
      name: ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'][id % 3],
      email: `user${id}@example.com`,
      score: 9.5 - id,
      active: id % 2 === 0,
      manager: null,
      tags: ['admin', 'beta'],
    });
    await body.fill(JSON.stringify({ total: 3, users: [1, 2, 3].map(user) }, null, 2));
    await app.screenshot({ path: `${SHOTS}/narrow-long.png` });
    // A body with a mistake, marked, its message on hover; then the body as it was.
    await body.fill('{\n  "id": 42\n  "name": "Ada Lovelace",\n  "active": true\n}');
    await app.waitForSelector('.code-error');
    const mark = await app.locator('.code-error').boundingBox();
    await app.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2);
    await app.screenshot({ path: `${SHOTS}/narrow-json-error.png` });
    await body.fill(before);
    await app.click('[data-testid="rule-back"]');
    await app.screenshot({ path: `${SHOTS}/narrow-list.png` });
    await show('traffic');
    await app.screenshot({ path: `${SHOTS}/narrow-traffic.png` });
    await app.emulateMedia({ colorScheme: 'dark' });
    await show('rules');
    await app.locator('[data-testid="rule"]').nth(3).click();
    await app.screenshot({ path: `${SHOTS}/narrow-dark.png` });
    // Back to the size the checks below expect, with the list and the editor side by side.
    await app.setViewportSize({ width: 1280, height: 820 });
  }

  const popup = await context.newPage();
  popup.on('pageerror', (error) => errors.push(`popup: ${error.message}`));
  // Chrome reports a CSP violation, such as a blocked <style> tag, as a console error.
  popup.on(
    'console',
    (message) =>
      message.type() === 'error' && errors.push(`popup console: ${message.text()}`),
  );
  await popup.setViewportSize({ width: 330, height: 560 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await check(
    "the popup lists every rule with its dot, which pulses green while it's on and is grey while it's off, and turns it off and on, saved at once",
    async () => {
      // The popup in a tab of its own is on no website, so it opens on All rules.
      await popup.waitForSelector('[data-testid="popup-rule"]');
      const first = popup.locator('[data-testid="popup-rule"]').first();
      const dot = first.locator('[role="switch"]');
      const stored = async () =>
        (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules[0].enabled;
      // What's saved, what the dot says, and whether it pulses.
      const state = async () => [
        await stored(),
        await dot.getAttribute('aria-checked'),
        await dot.evaluate((element) =>
          element.firstElementChild
            .getAnimations()
            .some((animation) => animation.animationName === 'signal-pulse'),
        ),
      ];
      const on = await state();
      // No Turn off or Turn on: the dot is the switch, and the row's one button is Edit this rule.
      const buttons = await first
        .locator('button')
        .evaluateAll((all) => all.map((button) => button.dataset.testid));
      await dot.click();
      await sleep(200);
      const off = await state();
      await dot.click();
      await sleep(200);
      expect(
        [on, off, await state(), buttons],
        [
          [true, 'true', true],
          [false, 'false', false],
          [true, 'true', true],
          ['edit-rule'],
        ],
      );
    },
  );
  await check(
    "a long rule name is cut short in the popup, after its dot and inside its row, with nothing moving under the pointer; the editor's list cuts a long URL in its middle, its end in sight inside the row, and shows a name or URL whole in a tooltip only when it's cut short",
    async () => {
      const rules = (await worker.evaluate(() => chrome.storage.local.get('rules')))
        .rules;
      const url = '/api/bill-pay/v2/bills/aedd32c6-6f1e-4c2b-9d7a-1e2f3a4b5c6d';
      const long = {
        ...rules[0],
        id: 'long-name',
        name: '',
        match: { ...rules[0].match, url, graphqlOperation: '' },
      };
      await setStorage({ rules: [long, ...rules] });
      try {
        // The popup: the name cut short, after the dot and inside the row (its 12 px of
        // padding), its width, and the row's height against the next one's.
        const row = popup.locator('[data-testid="popup-rule"]').first();
        await popup.waitForFunction(
          (name) =>
            document.querySelector('[data-testid="popup-rule"] [data-slot="item-title"]')
              ?.textContent === name,
          url,
          { timeout: 3000 },
        );
        const edges = () =>
          row.evaluate((element) => {
            const name = element.querySelector('[data-slot="item-title"]');
            const box = (target) => target.getBoundingClientRect();
            return [
              name.scrollWidth > name.clientWidth,
              box(element.querySelector('[role="switch"]')).right <= box(name).left + 0.5,
              box(name).right <= box(element).right - 12 + 0.5,
              box(name).width,
              box(element).height === box(element.nextElementSibling).height,
            ];
          });
        await popup.mouse.move(1, 1);
        const resting = await edges();
        await row.hover();
        await sleep(250);
        const pointed = await edges();
        // The editor: the long URL, its title as the rule has no name, cut in its middle: the
        // head cut short, the end whole and inside the row.
        await show('rules');
        await app.waitForSelector(`[data-testid="rule"][data-url="${url}"]`);
        const end = await app
          .locator(`[data-testid="rule"][data-url="${url}"]`)
          .evaluate((element) => {
            const head = element.querySelector(
              '[data-slot="item-title"] [data-part="head"]',
            );
            const tail = element.querySelector(
              '[data-slot="item-title"] [data-part="tail"]',
            );
            return [
              head.scrollWidth > head.clientWidth,
              tail.textContent,
              tail.scrollWidth <= tail.clientWidth,
              tail.getBoundingClientRect().right <= element.getBoundingClientRect().right,
            ];
          });
        // Each row under the pointer, its tooltip, and what it cuts short: a name at its end, a
        // URL in its middle (its head, or in less room than its end, its end).
        const tips = [];
        for (const item of await app.locator('[data-testid="rule"]').all()) {
          await item.hover();
          tips.push(
            await item.evaluate((element) => {
              const cut = [...element.querySelectorAll('[data-full]')]
                .filter((part) =>
                  [part, ...part.querySelectorAll('[data-part]')].some(
                    (each) => each.scrollWidth > each.clientWidth,
                  ),
                )
                .map((part) => part.dataset.full);
              return [
                cut.length > 0,
                element.getAttribute('title') === (cut.join('\n') || null),
              ];
            }),
          );
        }
        expect(
          [
            resting.filter((each) => typeof each === 'boolean'),
            pointed[3] === resting[3],
            end,
            tips.every(([, right]) => right),
            tips.some(([cut]) => cut),
            tips.some(([cut]) => !cut),
          ],
          [
            [true, true, true, true],
            true,
            [true, '1e2f3a4b5c6d', true, true],
            true,
            true,
            true,
          ],
        );
      } finally {
        await popup.mouse.move(1, 1);
        await setStorage({ rules });
        await sleep(300);
      }
    },
  );
  await check(
    "the popup's This page keeps a rule where it is when its dot turns it off, under Answering here with what it did, so a second click on the same spot turns the same rule back on",
    async () => {
      // Up to 0.22 a rule turned off there left for the folded Not answering here at once, the
      // next rule came up under the pointer, and a second click turned that one off too.
      const { rules, enabled, record } = await worker.evaluate(() =>
        chrome.storage.local.get(['rules', 'enabled', 'record']),
      );
      const stored = async () =>
        (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules.map(
          (rule) => rule.enabled,
        );
      let here;
      try {
        await setStorage({ enabled: true, record: true });
        // Two rules answer on the page, and the popup opens beside it, as the toolbar's would:
        // in a background tab, which takes the page's tab as the one it's about.
        await call('/api/user?case=replace');
        await call('/api/user?case=merge');
        await sleep(300);
        await page.bringToFront();
        const opened = context.waitForEvent('page', {
          predicate: (candidate) => candidate.url().includes('popup.html'),
        });
        await worker.evaluate(() =>
          chrome.tabs.create({ url: 'popup.html', active: false }),
        );
        here = await opened;
        here.on('pageerror', (error) => errors.push(`popup: ${error.message}`));
        await here.waitForSelector('[data-testid="not-answering"]', { timeout: 5000 });
        // The rules under Answering here: each one's name, whether its dot says on, and what it
        // did. And the count beside This page.
        const listed = () =>
          here.evaluate(() => {
            const fold = document.querySelector('[data-testid="not-answering"]');
            return [
              [...document.querySelectorAll('[data-testid="popup-rule"]')]
                .filter(
                  (row) =>
                    fold.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING,
                )
                .map((row) => [
                  row.querySelector('[data-slot="item-title"]').textContent,
                  row.querySelector('[role="switch"]').getAttribute('aria-checked') ===
                    'true',
                  row.querySelector('[data-testid="rule-did"]')?.textContent ?? '',
                ]),
              document.querySelector('[data-testid="view-page"]').textContent,
            ];
          });
        const initial = await stored();
        const changed = async () =>
          (await stored()).filter((on, index) => on !== initial[index]).length;
        const before = await listed();
        const box = await here
          .locator('[data-testid="popup-rule"] [role="switch"]')
          .first()
          .boundingBox();
        const spot = [box.x + box.width / 2, box.y + box.height / 2];
        await here.mouse.click(...spot);
        await sleep(300);
        const off = [await listed(), await changed()];
        await here.mouse.click(...spot);
        await sleep(300);
        const [[first, ...others], tab] = before;
        expect(
          [before[0].length >= 2, first[1], off, [await listed(), await changed()]],
          [true, true, [[[[first[0], false, first[2]], ...others], tab], 1], [before, 0]],
        );
      } finally {
        await here?.close();
        await popup.bringToFront();
        await setStorage({ rules, enabled, record });
        await sleep(300);
      }
    },
  );

  // The popup's rules as the editor's rows (3b): a rule's slot, what it did on the tab's page and
  // when ("1 mocked · 4m"), from the counts the page sends with when each rule last answered, or
  // under the pointer and with focus its Edit this rule; the step back in All rules; and the list
  // as a tree for the keyboard, with a rule's right-click menu. On a blank page of their own, whose
  // log starts empty (`popPage`), beside which a popup opens as the toolbar's would (`beside`):
  // five rules at the top of the list, then a group of two, Pops; three of them answer before the
  // popup opens, one 50 s and one 4 minutes before by the page's clock. The list, the folds and
  // the rule open in the editor as they were after these checks.
  const POP_ANSWERS = '/api/pop-answers';
  const POP_OLD = '/api/pop-old';
  const POP_NEVER = '/api/pop-never';
  const POP_OFF = '/api/pop-off';
  const POP_LATE = '/api/pop-late';
  const POP_ONE = '/api/pop-one';
  const POP_TWO = '/api/pop-two';
  const POPS = createGroup('Pops');
  const POP_RULES = [
    slotRule(POP_ANSWERS, 'Pop answers'),
    slotRule(POP_OLD, 'Pop answered before'),
    slotRule(POP_NEVER, 'Pop never asked for'),
    slotRule(POP_OFF, 'Pop switched off', false),
    slotRule(POP_LATE, 'Pop answers late'),
    ...[POP_ONE, POP_TWO].map((url, index) =>
      Object.assign(slotRule(url, `Pop ${index ? 'two' : 'one'}`), { group: POPS.id }),
    ),
  ];
  const popId = (url) => POP_RULES.find((rule) => rule.match.url === url).id;
  const { rules: beforePop, groups: beforePopGroups = [] } = await worker.evaluate(() =>
    chrome.storage.local.get(['rules', 'groups']),
  );
  const openBeforePop = await openNow();
  await setStorage({
    rules: [...POP_RULES, ...beforePop],
    groups: [{ ...POPS, at: 5 }, ...beforePopGroups],
  });
  const popPage = await context.newPage();
  popPage.on('pageerror', (error) => errors.push(`pop page: ${error.message}`));
  await popPage.goto(`${ORIGIN}/__control?popup`);
  const popTab = (await worker.evaluate(() => chrome.tabs.query({}))).find(
    (candidate) => candidate.url === popPage.url(),
  );
  // A request the page makes, `ago` ms back by its own clock, which its log keeps as when the
  // request was sent; and when (by this clock) it made it.
  const popCall = async (url, ago = 0) => {
    const at = Date.now();
    await popPage.evaluate(
      async ([target, back]) => {
        const real = Date.now;
        Date.now = () => real() - back;
        try {
          await (await fetch(target)).text();
          // The interceptor logs the request a moment after it ends.
          await new Promise((resolve) => setTimeout(resolve, 200));
        } finally {
          Date.now = real;
        }
      },
      [url, ago],
    );
    return at - ago;
  };
  // POP_OLD answers twice, 6 minutes back and then 4: the last time is the one it says.
  await popCall(POP_OLD, 6 * 60_000);
  const sentAt = {
    [POP_ANSWERS]: await popCall(POP_ANSWERS, 50_000),
    [POP_OLD]: await popCall(POP_OLD, 4 * 60_000),
    [POP_ONE]: await popCall(POP_ONE),
  };
  // The popup beside the page, as the toolbar's opens: in a background tab, which takes the page's
  // tab as the one it's about, 330 px wide. The side panel it opens the editor in (Edit this rule,
  // a row's click, Enter) is stood in for, as one opened here would stay open over the checks
  // after these: what it's asked for, the window, and whether the click or key that asked is the
  // user's, which Chrome needs; and the popup's window losing focus, which would close a popup.
  await popPage.bringToFront();
  const besideOpened = context.waitForEvent('page', {
    predicate: (candidate) => candidate.url().includes('popup.html'),
  });
  await worker.evaluate(() => chrome.tabs.create({ url: 'popup.html', active: false }));
  const beside = await besideOpened;
  beside.on('pageerror', (error) => errors.push(`popup beside: ${error.message}`));
  beside.on(
    'console',
    (message) =>
      message.type() === 'error' &&
      errors.push(`popup beside console: ${message.text()}`),
  );
  await beside.setViewportSize({ width: 330, height: 600 });
  await beside.waitForSelector('[data-testid="not-answering"]', { timeout: 5000 });
  await beside.bringToFront();
  await beside.evaluate(() => {
    window.sidePanels = [];
    chrome.sidePanel.open = (options) => {
      window.sidePanels.push([options.windowId, navigator.userActivation.isActive]);
      return new Promise(() => {});
    };
    window.blurs = 0;
    window.addEventListener('blur', () => (window.blurs += 1));
  });
  const besideWindow = await beside.evaluate(() =>
    chrome.windows.getCurrent().then(({ id }) => id),
  );
  const besideSession = await context.newCDPSession(beside);
  const popRow = (url) => beside.locator(`[data-testid="popup-rule"][data-url="${url}"]`);
  const popLine = (url) => popRow(url).evaluate(readLine);
  const popFold = beside.locator('[data-testid="not-answering-block"]');
  const popsItem = beside.locator(
    `[data-testid="popup-group-block"][data-item="${POPS.id}"]`,
  );
  // What has focus in the popup: a rule's row (what it matches), a group's ("group: " its name),
  // the fold, or else what it's called.
  const popFocus = () =>
    beside.evaluate(() => {
      const active = document.activeElement;
      if (!active?.matches('[role="treeitem"]'))
        return `not an item: ${active?.getAttribute('aria-label') ?? active?.textContent?.trim()}`;
      if (active.dataset.testid === 'not-answering-block') return 'fold';
      if (active.dataset.testid === 'popup-group-block')
        return `group: ${active.querySelector('[data-testid="popup-group"]').dataset.group}`;
      return active.dataset.url;
    });
  // Keys pressed one after another, and where focus is after each.
  const popKeys = async (keys) => {
    const seen = [];
    for (const key of keys) {
      await beside.keyboard.press(key);
      seen.push(await popFocus());
    }
    return seen;
  };
  // The list drawn anew: This page, the fold shut, no item focused before, and no menu a check
  // before left open.
  const popReset = async () => {
    if (await beside.locator('[data-slot="context-menu-content"]').count()) {
      await beside.keyboard.press('Escape');
      await beside
        .locator('[data-slot="context-menu-content"]')
        .waitFor({ state: 'detached', timeout: 3000 });
    }
    await beside.click('[data-testid="view-rules"]');
    await beside.click('[data-testid="view-page"]');
    await popFold.waitFor({ timeout: 3000 });
    await beside.mouse.move(1, 1);
  };
  const popGroup = async () =>
    (await worker.evaluate(() => chrome.storage.local.get('groups'))).groups.find(
      ({ id }) => id === POPS.id,
    );

  await check(
    'a popup row says at its right end what its rule did on the page and when, as the editor\'s does: "1 mocked · now", or "2 mocked · 4m" for requests the page made 6 and 4 minutes ago by its clock, the count in green and the time in grey; the page tells the popup when each rule last answered (last), beside its counts as they were',
    async () => {
      const theme = await textColours(beside);
      const said = await beside.evaluate(() =>
        [...document.querySelectorAll('[data-testid="popup-rule"]')]
          .filter((row) => !row.closest('[data-testid="not-answering-block"]'))
          .map((row) => [
            row.dataset.url,
            row.querySelector('[data-slot="item-status"]').textContent,
          ]),
      );
      const colours = await popRow(POP_OLD).evaluate((row) =>
        ['rule-did', 'rule-time'].map(
          (id) => getComputedStyle(row.querySelector(`[data-testid="${id}"]`)).color,
        ),
      );
      const told = await worker.evaluate(
        (id) =>
          chrome.tabs.sendMessage(id, { type: 'ghostfetch:counts' }, { frameId: 0 }),
        popTab.id,
      );
      // When each rule last answered, as the page tells it, against when it asked.
      const when = [POP_ANSWERS, POP_OLD, POP_ONE].map(
        (url) => Math.abs(told.last[popId(url)] - sentAt[url]) < 3000,
      );
      expect(
        [
          said,
          colours,
          Object.keys(told),
          told.record,
          Object.keys(told.rules).toSorted(),
          told.rules[popId(POP_OLD)],
          Object.keys(told.last).toSorted(),
          when,
        ],
        [
          [
            [POP_ANSWERS, '1 mocked · now'],
            [POP_OLD, '2 mocked · 4m'],
            [POP_ONE, '1 mocked · now'],
          ],
          [theme.signal, theme.t50],
          ['record', 'rules', 'last'],
          true,
          [POP_ANSWERS, POP_OLD, POP_ONE].map(popId).toSorted(),
          { mocked: 2, modified: 0, failed: 0 },
          [POP_ANSWERS, POP_OLD, POP_ONE].map(popId).toSorted(),
          [true, true, true],
        ],
      );
    },
  );
  await check(
    "a popup row's time moves on with the screens' clock by itself: the request made 50 s before the popup opened says now, then 1m from the clock's next tick, which draws the time again (RuleTime) and not the row (RuleRow) or the list",
    async () => {
      const before = (await popLine(POP_ANSWERS)).says;
      const counts = await drawsIn(besideSession, async () => {
        await beside.waitForFunction(
          (url) =>
            document.querySelector(
              `[data-testid="popup-rule"][data-url="${url}"] [data-testid="rule-time"]`,
            )?.textContent === '· 1m',
          POP_ANSWERS,
          { timeout: 20_000 },
        );
        await sleep(200);
      });
      expect(
        [
          before,
          (await popLine(POP_ANSWERS)).says,
          (counts.RuleTime ?? 0) > 0,
          counts.RuleRow ?? 0,
          counts.RuleList ?? 0,
        ],
        ['1 mocked · now', '1 mocked · 1m', true, 0, 0],
        `drawn: RuleTime ${counts.RuleTime}, RuleRow ${counts.RuleRow}, RuleList ${counts.RuleList}`,
      );
    },
  );
  await check(
    "under the pointer a popup row's slot shows its Edit this rule where it said what the rule did, and nothing in the row moves; Edit this rule, a click on the row and Enter on it each open the rule in the editor, in the side panel of the popup's window, asked in the user's click or key; its dot turns it off and on and opens nothing",
    async () => {
      await beside.mouse.move(1, 1);
      const rest = await popLine(POP_OLD);
      await popRow(POP_OLD).hover();
      const shown = await rowSettled(
        () => popLine(POP_OLD),
        (line) => line.actions === '1' && line.status === '0',
      );
      const opened = [];
      const opens = async (act, url) => {
        await act();
        opened.push(await rowSettled(openNow, (now) => now === url));
      };
      await opens(
        () => popRow(POP_OLD).locator('[data-testid="edit-rule"]').click(),
        POP_OLD,
      );
      await opens(
        () => popRow(POP_ANSWERS).locator('[data-slot="item-title"]').click(),
        POP_ANSWERS,
      );
      await opens(async () => {
        await popRow(POP_OLD).focus();
        await beside.keyboard.press('Enter');
      }, POP_OLD);
      const dot = popRow(POP_ANSWERS).locator('[role="switch"]');
      await dot.click();
      const off = (
        await rowSettled(
          () => slotStored(POP_ANSWERS),
          (rule) => !rule.enabled,
        )
      ).enabled;
      await dot.click();
      const on = (
        await rowSettled(
          () => slotStored(POP_ANSWERS),
          (rule) => rule.enabled,
        )
      ).enabled;
      await sleep(200);
      expect(
        [
          [rest.status, rest.actions],
          [shown.status, shown.actions, shown.name, shown.slot],
          opened,
          await beside.evaluate(() => window.sidePanels),
          [off, on],
          await openNow(),
        ],
        [
          ['1', '0'],
          ['0', '1', rest.name, rest.slot],
          [POP_OLD, POP_ANSWERS, POP_OLD],
          [
            [besideWindow, true],
            [besideWindow, true],
            [besideWindow, true],
          ],
          [false, true],
          POP_OLD,
        ],
      );
    },
  );
  await check(
    "the popup's rule list is a tree that's one Tab stop: Tab from its tabs lands on its first row, then on that row's Edit this rule, which shows, then out of the list; no other row's controls, nor any dot, is a Tab stop; each item says its level and its place among its own, the fold whether it's open; a screen reader names a row by its rule's name, described by what it did and what it matches, and the fold by its own",
    async () => {
      await popReset();
      const tree = await beside.evaluate(() => {
        const list = document.querySelector('[role="tree"]');
        const label = (item) =>
          item.dataset.testid === 'not-answering-block' ? 'fold' : item.dataset.url;
        return {
          name: list.getAttribute('aria-label'),
          items: [...list.querySelectorAll('[role="treeitem"]')].map((item) => [
            label(item),
            ...['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map(
              (name) => item.getAttribute(name),
            ),
          ]),
          stops: [...list.querySelectorAll('*')]
            .filter((element) => element.tabIndex >= 0)
            .map((element) =>
              element.matches('[role="treeitem"]')
                ? label(element)
                : element.getAttribute('aria-label'),
            ),
        };
      });
      await beside.locator('[data-testid="view-page"]').focus();
      const tabs = [];
      let actions = '';
      for (let time = 0; time < 3; time++) {
        await beside.keyboard.press('Tab');
        tabs.push(await popFocus());
        // With focus on Edit this rule, once the actions have faded in.
        if (time === 1)
          actions = (
            await rowSettled(
              () => popLine(POP_ANSWERS),
              (line) => line.actions === '1',
            )
          ).actions;
      }
      // Role, name and description, as Chromium gives them a screen reader.
      const ax = async (selector) => {
        const { root } = await besideSession.send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await besideSession.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector,
        });
        const { nodes } = await besideSession.send('Accessibility.getPartialAXTree', {
          nodeId,
          fetchRelatives: false,
        });
        return [
          nodes[0]?.role?.value,
          nodes[0]?.name?.value,
          nodes[0]?.description?.value,
        ];
      };
      const row = await ax(`[data-testid="popup-rule"][data-url="${POP_ANSWERS}"]`);
      const fold = await ax('[data-testid="not-answering-block"]');
      const EDIT = 'Edit this rule: “Pop answers”';
      expect(
        [
          tree.name,
          tree.items,
          tree.stops,
          tabs,
          actions,
          row.slice(0, 2),
          /^1 mocked · \d+m\b.*\/api\/pop-answers/.test(row[2]),
          fold.slice(0, 2),
          /^\d+ on · \d+ off$/.test(fold[2]),
        ],
        [
          'Rules',
          [
            [POP_ANSWERS, '1', '1', '4', null],
            [POP_OLD, '1', '2', '4', null],
            [POP_ONE, '1', '3', '4', null],
            ['fold', '1', '4', '4', 'false'],
          ],
          [POP_ANSWERS, EDIT],
          [POP_ANSWERS, `not an item: ${EDIT}`, 'not an item: Open editor'],
          '1',
          ['treeitem', 'Pop answers'],
          true,
          ['treeitem', 'Not answering here'],
          true,
        ],
        `described as “${row[2]}” and “${fold[2]}”`,
      );
    },
  );
  await check(
    "in the popup's This page ↑ ↓ Home End move between its rows, passing the fold's rules while it's shut; → opens the fold and goes on into it, ← goes from a rule in it back to the fold and shuts it; Enter and Space open and shut it; Space turns a focused rule off and on as its dot does, saved at once, the rule staying where it is with focus",
    async () => {
      await popReset();
      await popRow(POP_ANSWERS).focus();
      const open = () => popFold.getAttribute('aria-expanded');
      const shutMoves = await popKeys([
        'ArrowDown',
        'ArrowDown',
        'ArrowDown',
        'ArrowDown',
        'ArrowUp',
        'Home',
        'End',
      ]);
      const shut = await open();
      const into = await popKeys(['ArrowRight', 'ArrowRight', 'ArrowDown']);
      const opened = await open();
      const last = await beside.evaluate(
        () => [...document.querySelectorAll('[role="treeitem"]')].at(-1).dataset.url,
      );
      const out = await popKeys(['End', 'ArrowLeft', 'ArrowLeft']);
      const shutAgain = await open();
      const byKeys = [];
      for (const key of ['Enter', 'Enter', 'Space', 'Space']) {
        await beside.keyboard.press(key);
        byKeys.push(await open());
      }
      await beside.keyboard.press('Home');
      await beside.keyboard.press('Space');
      const off = (
        await rowSettled(
          () => slotStored(POP_ANSWERS),
          (rule) => !rule.enabled,
        )
      ).enabled;
      const stayed = [
        await popFocus(),
        await popRow(POP_ANSWERS).getAttribute('aria-posinset'),
      ];
      await beside.keyboard.press('Space');
      const on = (
        await rowSettled(
          () => slotStored(POP_ANSWERS),
          (rule) => rule.enabled,
        )
      ).enabled;
      expect(
        [shutMoves, shut, into, opened, out, shutAgain, byKeys, [off, on], stayed],
        [
          [POP_OLD, POP_ONE, 'fold', 'fold', POP_ONE, POP_ANSWERS, 'fold'],
          'false',
          ['fold', POP_NEVER, POP_OFF],
          'true',
          [last, 'fold', 'fold'],
          'false',
          ['true', 'false', 'true', 'false'],
          [false, true],
          [POP_ANSWERS, '1'],
        ],
      );
    },
  );
  await check(
    "in the popup's All rules → and ← unfold and fold a group and step into it and out, as in the editor's list, ↓ passing a folded group's rules; Enter folds and unfolds it too, and Space turns the group off and on as its dot does, saved at once",
    async () => {
      await beside.click('[data-testid="view-rules"]');
      await popsItem.waitFor({ timeout: 3000 });
      const next = await popsItem.evaluate((item) => {
        const after = item.nextElementSibling;
        return after.dataset.testid === 'popup-group-block'
          ? `group: ${after.querySelector('[data-testid="popup-group"]').dataset.group}`
          : after.dataset.url;
      });
      const expanded = () => popsItem.getAttribute('aria-expanded');
      await popsItem.focus();
      const inAndOut = await popKeys(['ArrowRight', 'ArrowLeft', 'ArrowLeft']);
      const folded = await expanded();
      const past = await popKeys(['ArrowDown', 'ArrowUp', 'ArrowRight']);
      const unfolded = await expanded();
      const byEnter = [];
      for (const key of ['Enter', 'Enter']) {
        await beside.keyboard.press(key);
        byEnter.push(await expanded());
      }
      await beside.keyboard.press('Space');
      const off = (await rowSettled(popGroup, (group) => !group.enabled)).enabled;
      await beside.keyboard.press('Space');
      const on = (await rowSettled(popGroup, (group) => group.enabled)).enabled;
      expect(
        [inAndOut, folded, past, unfolded, byEnter, [off, on], await popFocus()],
        [
          [POP_ONE, 'group: Pops', 'group: Pops'],
          'false',
          [next, 'group: Pops', 'group: Pops'],
          'true',
          ['false', 'true'],
          [false, true],
          'group: Pops',
        ],
      );
    },
  );
  await check(
    "a right-click on a popup rule's row opens its menu at the pointer: Edit this rule, and Turn off, which turns it off; the ContextMenu key, or Shift+F10, on the focused row opens it at the row's bottom left, saying Turn on now; Esc shuts the menu and not the popup (the key's taken, as it isn't with nothing open), focus back on the row; its Edit this rule opens the rule in the editor; a group's row and the fold keep the browser's menu",
    async () => {
      await popReset();
      const menu = beside.locator('[data-slot="context-menu-content"]');
      const items = async () => {
        await menu.locator('[role="menuitem"]').first().waitFor({ timeout: 3000 });
        return (await menu.locator('[role="menuitem"]').allTextContents()).map((text) =>
          text.trim(),
        );
      };
      const pick = async (testid) => {
        await menu.locator(`[data-testid="${testid}"]`).click();
        await menu.waitFor({ state: 'detached', timeout: 3000 });
      };
      const near = async (point) => {
        const box = await menu.boundingBox();
        return Boolean(box) && Math.hypot(box.x - point[0], box.y - point[1]) <= 12;
      };
      const row = popRow(POP_ANSWERS);
      const box = await row.boundingBox();
      const point = [box.x + 40, box.y + box.height / 2];
      await beside.mouse.click(...point, { button: 'right' });
      const byPointer = [
        await items(),
        await near(point),
        await row.getAttribute('data-context-open'),
      ];
      await pick('popup-menu-turn');
      const off = (
        await rowSettled(
          () => slotStored(POP_ANSWERS),
          (rule) => !rule.enabled,
        )
      ).enabled;
      const afterPick = await rowSettled(popFocus, (item) => item === POP_ANSWERS);
      await beside.evaluate(() => {
        window.escapes = [];
        window.addEventListener(
          'keydown',
          (event) => event.key === 'Escape' && window.escapes.push(event),
          true,
        );
      });
      await row.focus();
      await beside.keyboard.press('ContextMenu');
      const byKey = [await items(), await near([box.x, box.y + box.height])];
      await beside.keyboard.press('Escape');
      await menu.waitFor({ state: 'detached', timeout: 3000 });
      const back = await rowSettled(popFocus, (item) => item === POP_ANSWERS);
      await beside.keyboard.press('Escape');
      const taken = await beside.evaluate(() =>
        window.escapes.map((event) => event.defaultPrevented),
      );
      await beside.keyboard.press('Shift+F10');
      const byShift = await items();
      await pick('popup-menu-turn');
      const on = (
        await rowSettled(
          () => slotStored(POP_ANSWERS),
          (rule) => rule.enabled,
        )
      ).enabled;
      await row.click({ button: 'right', position: { x: 40, y: 12 } });
      await items();
      await pick('popup-menu-edit');
      const edited = await rowSettled(openNow, (url) => url === POP_ANSWERS);
      const panels = (await beside.evaluate(() => window.sidePanels)).at(-1);
      // Elsewhere: the fold's row, and in All rules a group's.
      await beside.evaluate(() => {
        window.menus = [];
        window.addEventListener('contextmenu', (event) => window.menus.push(event), true);
      });
      // Whether a right-click there opened a menu of ours, which is then shut so the check goes
      // on to the next.
      const ours = async (locator) => {
        await locator.click({ button: 'right' });
        await sleep(300);
        const opened = await menu.count();
        if (opened) {
          await beside.keyboard.press('Escape');
          await menu.waitFor({ state: 'detached', timeout: 3000 });
        }
        return opened;
      };
      const onFold = await ours(beside.locator('[data-testid="not-answering"]'));
      await beside.click('[data-testid="view-rules"]');
      const onGroup = await ours(popsItem.locator('[data-testid="popup-group"]'));
      const elsewhere = [
        onFold,
        onGroup,
        await beside.evaluate(() => window.menus.map((event) => event.defaultPrevented)),
      ];
      expect(
        [
          byPointer,
          off,
          afterPick,
          byKey,
          back,
          taken,
          byShift,
          on,
          edited,
          panels,
          elsewhere,
        ],
        [
          [['Edit this rule', 'Turn off'], true, ''],
          false,
          POP_ANSWERS,
          [['Edit this rule', 'Turn on'], true],
          POP_ANSWERS,
          [true, false],
          ['Edit this rule', 'Turn on'],
          true,
          POP_ANSWERS,
          [besideWindow, true],
          [0, 0, [false, false]],
        ],
      );
    },
  );
  await check(
    "in the popup's All rules a rule that's on but hasn't answered on the page steps back, as in the editor's list, its name at normal weight in a quieter grey, in a group too; one that answered stays as it was, and one that's off fades; under This page the fold's rules don't step back, the fold saying so already; while Recording is off, none does",
    async () => {
      const theme = await textColours(beside);
      const look = (url) =>
        popRow(url)
          .locator('[data-slot="item-title"]')
          .evaluate((title) => [
            getComputedStyle(title).fontWeight,
            getComputedStyle(title).color,
          ]);
      const seen = async () => [
        await look(POP_ANSWERS),
        await look(POP_NEVER),
        await look(POP_OFF),
        await look(POP_ONE),
        await look(POP_TWO),
      ];
      await beside.click('[data-testid="view-rules"]');
      await popsItem.waitFor({ timeout: 3000 });
      const all = await seen();
      await popReset();
      await beside.locator('[data-testid="not-answering"]').click();
      const folded = [await look(POP_NEVER), await look(POP_TWO)];
      let notRecording;
      try {
        await setStorage({ record: false });
        await beside.click('[data-testid="view-rules"]');
        notRecording = await rowSettled(seen, (rows) => rows[1][0] === '500');
      } finally {
        await setStorage({ record: true });
      }
      const again = await rowSettled(seen, (rows) => rows[1][0] === '400');
      const BRIGHT = ['500', theme.strong];
      const QUIET = ['400', theme.t65];
      const FADED = ['500', theme.t50];
      expect(
        [all, folded, notRecording, again],
        [
          [BRIGHT, QUIET, FADED, BRIGHT, QUIET],
          [BRIGHT, BRIGHT],
          [BRIGHT, BRIGHT, FADED, BRIGHT, BRIGHT],
          [BRIGHT, QUIET, FADED, BRIGHT, QUIET],
        ],
      );
    },
  );
  await check(
    "a rule focused in the popup's fold that answers on the page meanwhile goes up under Answering here, and focus goes with it; nothing in these checks took focus from the popup's window",
    async () => {
      await popReset();
      await popFold.focus();
      await popKeys(['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown']);
      const level = () =>
        beside.evaluate(() => document.activeElement.getAttribute('aria-level'));
      const before = [await popFocus(), await level()];
      await popCall(POP_LATE);
      const after = await rowSettled(
        async () => [await popFocus(), await level()],
        ([url, at]) => url === POP_LATE && at === '1',
      );
      expect(
        [before, after, await beside.evaluate(() => window.blurs)],
        [[POP_LATE, '2'], [POP_LATE, '1'], 0],
      );
    },
  );
  await check(
    "in Commit Mono at Larger, at the popup's 330 px, nothing in its rows reaches past their edges: a rule's slot ends inside its row, its name keeps 7 letters' room, and what the slot says gives way, the time first, then the count, as in the editor's list; a group's row and the fold's stay on one line inside theirs",
    async () => {
      // Each rule's row: whether its slot ends inside its padding and nothing in it overflows it,
      // whether its name has its room, and each part of what its slot says, whole, cut, or out of
      // sight; each group's row and the fold's: whether all of it is on its one line inside it;
      // and whether the page itself is wider than the popup.
      const rows = () =>
        beside.evaluate(() => ({
          rules: [...document.querySelectorAll('[data-testid="popup-rule"]')].map(
            (row) => {
              const edge =
                row.getBoundingClientRect().right -
                parseFloat(getComputedStyle(row).paddingRight);
              const slot = row
                .querySelector('[data-slot="item-slot"]')
                .getBoundingClientRect();
              const title = row.querySelector('[data-slot="item-title"]');
              const line = title.parentElement.getBoundingClientRect().width;
              const em = parseFloat(getComputedStyle(title).fontSize);
              const status = row.querySelector('[data-slot="item-status"]');
              const bottom = status.getBoundingClientRect().bottom;
              return {
                url: row.dataset.url,
                inside: slot.right <= edge + 0.5 && row.scrollWidth <= row.clientWidth,
                room:
                  title.getBoundingClientRect().width >=
                  Math.min(7 * em, 0.6 * line) - 0.5,
                says: [...status.children].map((said) =>
                  said.getBoundingClientRect().top >= bottom - 1
                    ? 'gone'
                    : said.scrollWidth > said.clientWidth
                      ? 'cut'
                      : 'whole',
                ),
              };
            },
          ),
          heads: [
            ...document.querySelectorAll(
              '[data-testid="popup-group"], [data-testid="not-answering"]',
            ),
          ].map((head) => {
            const box = head.getBoundingClientRect();
            // Each of its words' runs on one line: one box each, or boxes at one height.
            const texts = document.createTreeWalker(head, NodeFilter.SHOW_TEXT);
            let wraps = false;
            while (texts.nextNode()) {
              const range = document.createRange();
              range.selectNodeContents(texts.currentNode);
              const tops = new Set(
                [...range.getClientRects()].map((rect) => Math.round(rect.top)),
              );
              if (tops.size > 1) wraps = true;
            }
            return (
              head.scrollWidth <= head.clientWidth &&
              !wraps &&
              // What shows: not the hidden checkbox Base UI keeps beside a group's switch.
              [...head.children].every((part) => {
                if (part instanceof HTMLInputElement) return true;
                const at = part.getBoundingClientRect();
                return (
                  at.top >= box.top - 0.5 &&
                  at.bottom <= box.bottom + 0.5 &&
                  at.right <= box.right + 0.5
                );
              })
            );
          }),
          wider: document.documentElement.scrollWidth > 330,
        }));
      // The time goes first, then the count: what a slot may say ('' for a rule that hasn't
      // answered).
      const GIVES_WAY = ['', 'whole,whole', 'whole,gone', 'cut,gone'];
      const fits = ({ rules, heads, wider }) =>
        rules.length > 0 &&
        rules.every(
          (row) => row.inside && row.room && GIVES_WAY.includes(`${row.says}`),
        ) &&
        heads.length > 0 &&
        heads.every(Boolean) &&
        !wider;
      try {
        await beside.evaluate(() =>
          Object.assign(document.documentElement.dataset, {
            font: 'mono',
            size: 'larger',
          }),
        );
        await beside.evaluate(() => document.fonts.ready);
        await popReset();
        await beside.locator('[data-testid="not-answering"]').click();
        const thisPage = await rows();
        await beside.click('[data-testid="view-rules"]');
        await popsItem.waitFor({ timeout: 3000 });
        const allRules = await rows();
        expect(
          [
            fits(thisPage),
            fits(allRules),
            allRules.rules.some((row) => row.says[1] === 'gone'),
          ],
          [true, true, true],
          JSON.stringify({ thisPage, allRules }),
        );
      } finally {
        await beside.evaluate(() => {
          delete document.documentElement.dataset.font;
          delete document.documentElement.dataset.size;
        });
      }
    },
  );
  await besideSession.detach();
  await beside.close();
  await popPage.close();
  await setStorage({ rules: beforePop, groups: beforePopGroups });
  await ruleRow(POP_ANSWERS).waitFor({ state: 'detached', timeout: 3000 });
  // Pops folded and unfolded left the folds' key behind, which the editor's settings check after
  // these would find.
  await app.evaluate(() => localStorage.removeItem('ghostfetch.folded'));
  if (openBeforePop && (await openNow()) !== openBeforePop) {
    await ruleRow(openBeforePop).click();
    await rowSettled(openNow, (url) => url === openBeforePop);
  }
  await popup.bringToFront();

  // The popup's Pause, Resume and Recording, clicked as a user does, and what the views, the
  // toolbar badge and the page then do (Paused, docs/glossary/rules.md; Recording,
  // docs/glossary/traffic.md). Each check leaves Ghostfetch on and recording, as the checks after
  // them expect, one that fails half way too; only Pause, once it has passed, leaves it paused, for
  // Resume.
  const PAUSED_BAR =
    "Ghostfetch is off. Rules aren't applied until you turn it on from its toolbar icon.";
  const NOT_RECORDING_NOTICE =
    'Recording is off, so new requests aren’t captured. Rules still apply. Start recording in the toolbar popup.';
  const GREEN = [52, 211, 153, 255];
  const GREY = [107, 114, 128, 255];
  // What `read` gives once `done` says it's there, or what it gives after 3 s: for what follows a
  // switch a moment later (another view, the badge, the page).
  const settled = async (read, done) => {
    const end = Date.now() + 3000;
    for (;;) {
      const value = await read();
      if (done(value) || Date.now() > end) return value;
      await sleep(50);
    }
  };
  // Whether a value is `wanted`, as expect() compares them.
  const same = (wanted) => (value) => JSON.stringify(value) === JSON.stringify(wanted);
  // The two switches as they're stored.
  const switches = async () => {
    const { enabled, record } = await worker.evaluate(() =>
      chrome.storage.local.get(['enabled', 'record']),
    );
    return { enabled, record };
  };
  // The toolbar badge: its text and its colour.
  const badgeShown = () =>
    worker.evaluate(async () => [
      await chrome.action.getBadgeText({}),
      await chrome.action.getBadgeBackgroundColor({}),
    ]);
  // Ghostfetch on and recording again, whatever a check left.
  const switchOn = () => setStorage({ enabled: true, record: true });
  // What a view says of the two switches, as it is or (`first`) as it first drew it (openView()):
  // the popup's Pause or Resume, the words of its Recording or of Traffic's, and the editor's bar.
  const says = (view, first = false) =>
    view.evaluate((atFirst) => {
      const root = atFirst ? window.firstDrawn : document;
      return {
        switch: ['pause', 'resume'].filter((id) =>
          root.querySelector(`[data-testid="${id}"]`),
        ),
        recording: root.querySelector('[data-testid="record"]')?.textContent ?? null,
        bar: [...root.querySelectorAll('[data-slot="alert"]')]
          .map((alert) => alert.textContent)
          .filter((text) => text.startsWith('Ghostfetch is off.')),
      };
    }, first);
  // The rule that answers /api/user?case=replace (a 404 and { name: "Mocked" }): its row in the
  // editor's list and in the popup's All rules.
  const replaceRow = app.locator(
    '[data-testid="rule"][data-url="/api/user?case=replace"]',
  );
  const replaceInPopup = popup.locator('[data-testid="popup-rule"]', {
    hasText: '/api/user?case=replace',
  });
  // A row's dot: whether it says on, and whether it pulses.
  const rowDot = (row) =>
    row
      .locator('[role="switch"]')
      .evaluate((element) => [
        element.getAttribute('aria-checked'),
        element.firstElementChild
          .getAnimations()
          .some((animation) => animation.animationName === 'signal-pulse'),
      ]);
  // Ghostfetch's switch as the popup and the editor show it, and the rule open in the editor: its
  // chip's words (before what it did on the page), and its dots in the two lists.
  const pauseShown = async () => ({
    popup: (await says(popup)).switch,
    bar: (await says(app)).bar,
    chip: (await app.textContent('[data-testid="rule-state"]')).split(' · ')[0],
    dots: [await rowDot(replaceRow), await rowDot(replaceInPopup)],
  });
  const ON = {
    popup: ['pause'],
    bar: [],
    chip: 'Mocking',
    dots: [
      ['true', true],
      ['true', true],
    ],
  };
  const PAUSED = {
    popup: ['resume'],
    bar: [PAUSED_BAR],
    chip: 'Paused while Ghostfetch is off',
    dots: [
      ['true', false],
      ['true', false],
    ],
  };
  // What the page gets from /api/user?case=replace: the status and the name.
  const replaced = async () => {
    const { status, body: got } = await call('/api/user?case=replace');
    return [status, got?.name];
  };
  // The badge as Pause found it, which Resume puts back.
  let badgeOn;
  await check(
    "the popup's Pause: it offers Resume, the toolbar badge says off in grey, the editor's bar says Ghostfetch is off, an answering rule's chip says it's paused while Ghostfetch is off and its dots are still, the page gets the server's response, and enabled is stored false",
    async () => {
      try {
        await show('rules');
        await replaceRow.click();
        await app
          .locator(
            '[data-testid="rule"][data-url="/api/user?case=replace"][data-selected]',
          )
          .waitFor({ timeout: 3000 });
        badgeOn = await badgeShown();
        expect(
          [await settled(pauseShown, same(ON)), Number(badgeOn[0]) > 0, badgeOn[1]],
          [ON, true, GREEN],
          'before Pause',
        );
        await popup.click('[data-testid="pause"]');
        // The page asks again until it has heard; the rule answers it until then.
        expect(
          [
            await settled(pauseShown, same(PAUSED)),
            await settled(badgeShown, same(['off', GREY])),
            await settled(replaced, same([200, 'Real'])),
            (await switches()).enabled,
          ],
          [PAUSED, ['off', GREY], [200, 'Real'], false],
        );
      } catch (error) {
        await switchOn();
        throw error;
      }
    },
  );
  await check(
    "the popup's Resume: the popup, the badge, the editor's bar and the rule's chip and dots as they were before Pause, the page's request answered by the rule again, and enabled stored true",
    async () => {
      try {
        await popup.click('[data-testid="resume"]');
        expect(
          [
            await settled(pauseShown, same(ON)),
            await settled(badgeShown, same(badgeOn)),
            await settled(replaced, same([404, 'Mocked'])),
            (await switches()).enabled,
          ],
          [ON, badgeOn, [404, 'Mocked'], true],
        );
      } finally {
        await switchOn();
      }
    },
  );
  await check(
    "the popup's Recording, off: the popup and Traffic say so, a request made meanwhile isn't listed and its rule's row says nothing of what it did, though the rule answers it, and record is stored false; on again, the next request is listed",
    async () => {
      // Whether the page's own log records, as it tells the popup with its counts.
      const tab = (await worker.evaluate(() => chrome.tabs.query({}))).find(
        (candidate) => candidate.url === page.url(),
      );
      const pageRecords = () =>
        worker.evaluate(
          (id) =>
            chrome.tabs
              .sendMessage(id, { type: 'ghostfetch:counts' }, { frameId: 0 })
              .then((counts) => counts.record),
          tab.id,
        );
      // The rule that answers /api/early, as it's stored, and its row in the editor's list.
      const { rules } = await worker.evaluate(() => chrome.storage.local.get('rules'));
      const earlyRule = rules.find((rule) => rule.match.url === '/api/early');
      const early = app.locator('[data-testid="rule"][data-url="/api/early"]');
      // What the popup and Traffic say of Recording, whether the row of the rule that answers
      // /api/early says what it did on the page, and which of this check's requests are listed.
      const heard = async () => ({
        popup: await popup
          .locator('[data-testid="record"]')
          .evaluate((button) => [
            button.textContent,
            button.getAttribute('aria-pressed'),
          ]),
        traffic: await app.evaluate(() => [
          document.querySelector('[data-testid="record"]').textContent,
          document.querySelector('[data-testid="traffic-notice"]')?.textContent ?? null,
        ]),
        did: (await early.locator('[data-testid="rule-signal"]').count()) > 0,
        listed: await app.evaluate(() =>
          ['before', 'meanwhile', 'after'].filter((when) =>
            [...document.querySelectorAll('[data-testid="request"]')].some((row) =>
              row.textContent.includes(`recording=${when}`),
            ),
          ),
        ),
      });
      const recordingWith = (requests) => ({
        popup: ['Recording', 'true'],
        traffic: ['Recording', null],
        did: true,
        listed: requests,
      });
      const NOT_RECORDING = {
        popup: ['Not recording', 'false'],
        traffic: ['Not recording', NOT_RECORDING_NOTICE],
        did: false,
        listed: ['before'],
      };
      try {
        await show('traffic');
        await call('/api/early?recording=before');
        const before = await settled(heard, same(recordingWith(['before'])));
        await popup.click('[data-testid="record"]');
        const off = await settled(heard, same(NOT_RECORDING));
        // The page's log stops a moment after the views say so.
        const stopped = await settled(pageRecords, (on) => on === false);
        const answered = await page.evaluate(() =>
          fetch('/api/early?recording=meanwhile').then((response) => response.text()),
        );
        const stored = (await switches()).record;
        await popup.click('[data-testid="record"]');
        // The page's bridge passes the switch on to the page as it starts its log again, so the
        // next request is recorded. A page's requests are listed in the order it made them, so
        // once that one is, the one made meanwhile would be too, had it been recorded.
        const started = await settled(pageRecords, (on) => on === true);
        await call('/api/early?recording=after');
        const after = await settled(heard, same(recordingWith(['before', 'after'])));
        await show('rules');
        expect(
          [
            before,
            off,
            stopped,
            answered,
            stored,
            started,
            after,
            (await switches()).record,
          ],
          [
            recordingWith(['before']),
            NOT_RECORDING,
            false,
            earlyRule.response.body,
            false,
            true,
            recordingWith(['before', 'after']),
            true,
          ],
        );
      } finally {
        await switchOn();
      }
    },
  );
  // A view in a tab of its own, as the toolbar's popup or the editor opens, which keeps what it
  // first drew (window.firstDrawn, for says()): its root as it was the moment its script drew it,
  // before anything after could change it.
  const openView = async (file) => {
    const view = await context.newPage();
    view.on('pageerror', (error) => errors.push(`${file}: ${error.message}`));
    view.on(
      'console',
      (message) =>
        message.type() === 'error' && errors.push(`${file} console: ${message.text()}`),
    );
    await view.addInitScript(() => {
      new MutationObserver((_, observer) => {
        const root = document.getElementById('root');
        if (!root?.firstChild) return;
        observer.disconnect();
        window.firstDrawn = root.cloneNode(true);
      }).observe(document, { childList: true, subtree: true });
    });
    await view.goto(`chrome-extension://${extensionId}/${file}`);
    await view.waitForFunction(() => window.firstDrawn);
    return view;
  };
  // What a popup and an editor show of the two switches (says()): on and recording, paused, and
  // not recording. One switch at a time, so a view that read the other's key would be caught.
  const VIEWS_ON = [
    { switch: ['pause'], recording: 'Recording', bar: [] },
    { switch: [], recording: 'Recording', bar: [] },
  ];
  const VIEWS_PAUSED = [
    { switch: ['resume'], recording: 'Recording', bar: [] },
    { switch: [], recording: 'Recording', bar: [PAUSED_BAR] },
  ];
  const VIEWS_NOT_RECORDING = [
    { switch: ['pause'], recording: 'Not recording', bar: [] },
    { switch: [], recording: 'Not recording', bar: [] },
  ];
  await check(
    "a popup and an editor opened while Ghostfetch is paused, or while it isn't recording, show it in the first thing they draw, as a popup opened while it's on and recording shows that, and follow that popup's Resume and Recording",
    async () => {
      const views = [];
      // A popup and an editor opened now, and what each first drew.
      const openTwo = async () => {
        const two = [await openView('popup.html'), await openView('sidepanel.html')];
        views.push(...two);
        return [two, [await says(two[0], true), await says(two[1], true)]];
      };
      // What the two show, once it's `wanted` (or after 3 s).
      const showing = (two, wanted) =>
        settled(async () => [await says(two[0]), await says(two[1])], same(wanted));
      try {
        // A popup opened while on and recording, which pauses Ghostfetch, then closes, as a popup
        // does.
        const first = await openView('popup.html');
        views.push(first);
        expect(
          await says(first, true),
          VIEWS_ON[0],
          'a popup opened while on and recording',
        );
        await first.click('[data-testid="pause"]');
        const paused = await settled(switches, same({ enabled: false, record: true }));
        await first.close();
        // Opened while paused: their popup resumes Ghostfetch and stops recording.
        const [whilePaused, drawnPaused] = await openTwo();
        await whilePaused[0].click('[data-testid="resume"]');
        await whilePaused[0].click('[data-testid="record"]');
        const followed = await showing(whilePaused, VIEWS_NOT_RECORDING);
        const unrecorded = await settled(
          switches,
          same({ enabled: true, record: false }),
        );
        for (const view of whilePaused) await view.close();
        // Opened while not recording: their popup starts recording again.
        const [whileUnrecorded, drawnUnrecorded] = await openTwo();
        await whileUnrecorded[0].click('[data-testid="record"]');
        expect(
          [
            paused,
            drawnPaused,
            followed,
            unrecorded,
            drawnUnrecorded,
            await showing(whileUnrecorded, VIEWS_ON),
          ],
          [
            { enabled: false, record: true },
            VIEWS_PAUSED,
            VIEWS_NOT_RECORDING,
            { enabled: true, record: false },
            VIEWS_NOT_RECORDING,
            VIEWS_ON,
          ],
        );
      } finally {
        for (const view of views) if (!view.isClosed()) await view.close();
        await popup.bringToFront();
        await switchOn();
      }
    },
  );
  await check(
    "the ⋯ menu's Theme recolours the editor and the open popup at once, a page draws in it from the start, and Ghostfetch's own comes back",
    async () => {
      // The theme on <html>, the page's colour, and what's remembered.
      const look = (target) =>
        target.evaluate(() => [
          document.documentElement.dataset.theme ?? '',
          getComputedStyle(document.body).backgroundColor,
          localStorage.getItem('ghostfetch.theme'),
        ]);
      const pick = async (theme) => {
        await app.click('[data-testid="sidebar-menu"]');
        await app.click('[data-testid="theme-menu"]');
        await app.click(`[data-testid="theme-${theme}"]`);
        // The menu stays open, to try another.
        await app.waitForSelector(`[data-testid="theme-${theme}"][data-checked]`);
        await app.keyboard.press('Escape');
        await app.keyboard.press('Escape');
      };
      const ROSE_PINE = ['rose-pine', 'rgb(25, 23, 36)', 'rose-pine'];
      await pick('rose-pine');
      const seen = [await look(app)];
      // The popup, already open, follows (the storage event).
      await popup.waitForFunction(
        () => document.documentElement.dataset.theme === 'rose-pine',
      );
      seen.push(await look(popup));
      // public/theme.js is a plain script in <head>, ahead of the page's modules, so the theme is
      // on <html> before the page first draws.
      await app.reload();
      seen.push(
        await app.evaluate(
          () =>
            [...document.head.querySelectorAll('script')].map(
              (script) => `${script.type || 'classic'} ${new URL(script.src).pathname}`,
            )[0],
        ),
        await look(app),
      );
      await pick('ghostfetch');
      seen.push(await look(app));
      expect(seen, [
        ROSE_PINE,
        ROSE_PINE,
        'classic /theme.js',
        ROSE_PINE,
        ['', 'rgb(11, 11, 12)', null],
      ]);
    },
  );
  await check(
    "the ⋯ menu's Appearance restyles the editor and the open popup at once, a page opened afterwards has it before it draws, and the defaults picked again leave nothing behind",
    async () => {
      // What's on <html> and stored for each setting, and what the page draws with: how far the
      // grey levels are lifted, and the font and size of body text, read from a probe with the
      // type size the kit gives it (<body>'s own size isn't one: Chrome sets it to 75% on
      // extension pages, over the kit's).
      const look = (target) =>
        target.evaluate(() => {
          const names = ['contrast', 'font', 'size'];
          const root = document.documentElement;
          const probe = document.createElement('span');
          probe.className = 'text-body';
          document.body.append(probe);
          const text = getComputedStyle(probe);
          const drawn = [
            text.fontFamily.split(',')[0].replaceAll('"', ''),
            text.fontSize,
          ];
          probe.remove();
          return [
            names.map((name) => root.dataset[name] ?? ''),
            names.map((name) => localStorage.getItem(`ghostfetch.${name}`)),
            getComputedStyle(root).getPropertyValue('--lift').trim(),
            ...drawn,
          ];
        });
      const pick = async (...steps) => {
        await app.click('[data-testid="sidebar-menu"]');
        await app.click('[data-testid="appearance-menu"]');
        for (const step of steps) {
          await app.click(`[data-testid="${step}"]`);
          // The menu stays open, to pick another.
          await app.waitForSelector(`[data-testid="${step}"][data-checked]`);
        }
        await app.keyboard.press('Escape');
        await app.keyboard.press('Escape');
      };
      const PICKED = [
        ['most', 'mono', 'larger'],
        ['most', 'mono', 'larger'],
        '60%',
        'Commit Mono',
        '16.5px',
      ];
      const DEFAULTS = [['', '', ''], [null, null, null], '0%', 'Geist', '13px'];
      const fresh = await context.newPage();
      try {
        await pick('contrast-most', 'font-mono', 'size-larger');
        const seen = [await look(app)];
        // The popup, already open, follows (the storage event).
        await popup.waitForFunction(
          () => document.documentElement.dataset.size === 'larger',
        );
        seen.push(await look(popup));
        // A page opened now has them on <html> as its <body> begins: public/theme.js, in
        // <head>, has put them there, and none of the page's modules has run yet.
        await fresh.addInitScript(() => {
          new MutationObserver((records, observer) => {
            if (!document.body) return;
            observer.disconnect();
            window.atBody = ['theme', 'contrast', 'font', 'size'].map(
              (name) => document.documentElement.dataset[name] ?? '',
            );
          }).observe(document, { childList: true, subtree: true });
        });
        await fresh.goto(`chrome-extension://${extensionId}/popup.html`);
        await fresh.waitForFunction(() => window.atBody);
        seen.push(await fresh.evaluate(() => window.atBody));
        await pick('contrast-standard', 'font-geist', 'size-default');
        seen.push(await look(app));
        await popup.waitForFunction(() => !document.documentElement.dataset.size);
        seen.push(await look(popup));
        expect(seen, [
          PICKED,
          PICKED,
          ['', 'most', 'mono', 'larger'],
          DEFAULTS,
          DEFAULTS,
        ]);
      } finally {
        // The defaults again whatever happened, for the checks after this one.
        await fresh.close();
        await app.evaluate(() => {
          for (const name of ['contrast', 'font', 'size']) {
            localStorage.removeItem(`ghostfetch.${name}`);
            delete document.documentElement.dataset[name];
          }
        });
      }
    },
  );
  await check(
    "every theme's selection colour is see-through: the body editor's selection lies over its coloured text",
    async () => {
      // Each theme the stylesheets have, and how opaque its selection colour is, read through a
      // probe's background (a custom property's own value isn't resolved).
      const alphas = await app.evaluate(() => {
        const rules = (list) =>
          [...list].flatMap((rule) => [
            rule,
            ...(rule.cssRules ? rules(rule.cssRules) : []),
          ]);
        const themes = new Set(
          [...document.styleSheets]
            .flatMap((sheet) => rules(sheet.cssRules))
            .flatMap((rule) => [
              ...(rule.selectorText ?? '').matchAll(/\[data-theme=['"]?([\w-]+)['"]?\]/g),
            ])
            .map((match) => match[1]),
        );
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--selection)';
        document.body.append(probe);
        const alpha = {};
        for (const theme of themes) {
          probe.dataset.theme = theme;
          const channels = getComputedStyle(probe).backgroundColor.match(/[\d.]+/g);
          alpha[theme] = Number(channels[3] ?? 1);
        }
        probe.remove();
        return alpha;
      });
      expect(
        [
          Object.keys(alphas).includes('vague'),
          Object.keys(alphas).filter((theme) => alphas[theme] >= 1),
        ],
        [true, []],
        JSON.stringify(alphas),
      );
    },
  );
  if (SHOTS) await popup.screenshot({ path: `${SHOTS}/popup.png` });

  console.log('security');
  await check('a page cannot steal the rule channel after startup', async () => {
    const probe = await context.newPage();
    await probe.goto(ORIGIN);
    await probe.evaluate(() => window.early);
    const stolen = await probe.evaluate(
      () =>
        new Promise((resolve) => {
          const got = [];
          const steal = (event) => {
            if (event.data?.ghostfetch !== 'port' || !event.ports[0]) return;
            event.stopImmediatePropagation();
            got.push('port');
            const [port] = event.ports;
            port.addEventListener('message', ({ data }) =>
              got.push(`${data?.type}: ${data?.rules?.length ?? 0} rules`),
            );
            port.start();
          };
          window.addEventListener('message', steal, true);
          // Pretend to be the interceptor asking for a channel.
          window.postMessage({ ghostfetch: 'hello' }, '*');
          setTimeout(() => resolve(got), 600);
        }),
    );
    expect(stolen, []);
    const response = await probe.evaluate(() =>
      fetch('/api/user?case=replace').then((r) => r.json()),
    );
    expect(response, { name: 'Mocked' }, 'mocking still works afterwards');
    await probe.close();
  });
  await check('a page cannot steal the rule channel while it loads', async () => {
    const probe = await context.newPage();
    await probe.goto(`${ORIGIN}/steal`);
    await sleep(600);
    expect(await probe.evaluate(() => window.stolen), []);
    await probe.close();
  });
  await check(
    'page-controlled request fields cannot inject HTML into the editor',
    async () => {
      await show('traffic');
      await page.evaluate(() =>
        fetch('/api/user?case=xss', { method: '<img data-xss=1>' }).catch(() => {}),
      );
      await app.waitForSelector(
        '[data-testid="request-path"]:text("/api/user?case=xss")',
        { timeout: 3000 },
      );
      await app
        .locator('[data-testid="request"]', { hasText: 'case=xss' })
        .first()
        .click();
      expect(await app.locator('[data-xss]').count(), 0, 'injected elements');
    },
  );
  await check(
    'imported rule files are validated and arrive turned off; a redirect rule is skipped',
    async () => {
      const evil = {
        rules: [
          {
            name: 'Imported <img data-xss=1>',
            type: 'response',
            match: { url: '/imported', method: '<img data-xss=1>', mode: 'constructor' },
            response: {
              delay: '"><img data-xss=1>',
              status: '<b>',
              headers: [{ op: 'set', name: 1, value: {} }],
            },
          },
          // As 0.8 exported it.
          {
            name: 'Old redirect',
            type: 'redirect',
            match: { url: '/imported-redirect' },
            redirect: { to: 'https://evil.test/' },
          },
        ],
      };
      await app.setInputFiles('[data-testid="import-file"]', {
        name: 'evil.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(evil)),
      });
      await app.waitForSelector(
        '[data-testid="view-rules"]:not([hidden]) [data-testid="rule-name"]',
      );
      expect(await app.locator('[data-xss]').count(), 0, 'injected elements');
      const { rules } = await worker.evaluate(() => chrome.storage.local.get('rules'));
      const imported = rules.find((r) => r.match.url === '/imported');
      const headers = imported.response.headers.map((row) => [
        row.op,
        row.name,
        row.value,
      ]);
      // The toast says what was skipped (it can follow another one that's still closing).
      const toldSkipped = await app
        .locator('[data-slot="toast"]', {
          hasText: '1 redirect, header or block rule was skipped',
        })
        .waitFor({ timeout: 5000 })
        .then(
          () => true,
          () => false,
        );
      expect(
        [
          imported.enabled,
          'type' in imported,
          imported.match.method,
          imported.match.mode,
          imported.response.delay,
          imported.response.status,
          headers,
          rules.some((r) => r.match.url === '/imported-redirect'),
          toldSkipped,
        ],
        [false, false, 'ANY', 'contains', 0, '', [['set', '', '']], false, true],
      );
    },
  );

  // Loads a hostile page, then makes a mocked fetch so the traffic report goes over the port
  // too, and returns what the page managed to grab.
  async function probeChannel(pathname) {
    const probe = await context.newPage();
    await probe.goto(`${ORIGIN}${pathname}`);
    await sleep(600);
    const response = await probe.evaluate(() =>
      fetch('/api/user?case=replace').then((r) => r.json()),
    );
    await sleep(200);
    const stolen = await probe.evaluate(() => window.stolen);
    await probe.close();
    return { response, stolen };
  }
  await check(
    'a page that patches the message plumbing still cannot get the channel',
    async () => {
      const { response, stolen } = await probeChannel('/steal-patched');
      expect(stolen, []);
      expect(response, { name: 'Mocked' }, 'mocking still works');
    },
  );
  await check(
    'a page cannot slip the interceptor a forged channel with dispatchEvent()',
    async () => {
      const { response, stolen } = await probeChannel('/steal-forged');
      expect(stolen, []);
      expect(response, { name: 'Mocked' }, 'mocking still works');
    },
  );
  await check(
    "a built-in the page patches can't reach the interceptor's functions through .caller",
    async () => {
      const probe = await context.newPage();
      await probe.goto(`${ORIGIN}/steal-caller`);
      await sleep(600);
      const { response, stolen } = await probe.evaluate(() => window.attack());
      await probe.close();
      // Only the page's own decoy: the interceptor is strict mode, so the browser hides it.
      expect(stolen, ['decoy']);
      expect(response, { name: 'Mocked' }, 'mocking still works');
    },
  );
  await check('local.* hosts get mocks, from the first request on', async () => {
    const probe = await context.newPage();
    await probe.goto(`${LOCAL_ORIGIN}/`);
    const early = await probe.evaluate(() => window.early);
    const later = await probe.evaluate(() =>
      fetch('/api/user?case=replace').then((response) => response.json()),
    );
    await probe.close();
    expect([early, later], [{ early: 'mocked' }, { name: 'Mocked' }]);
  });
  await check(
    'a URL that only looks like local.* ("local.x@" before another host) gets nothing',
    async () => {
      const probe = await context.newPage();
      await probe.goto(
        `${EVIL_ORIGIN.replace('://', '://local.ghostfetch.test@')}/steal`,
      );
      await sleep(600);
      const r = await probe.evaluate(() => ({
        url: document.URL,
        wrapped: !String(window.fetch).includes('[native code]'),
        flag: Symbol.for('ghostfetch.interceptor') in window,
        stolen: window.stolen,
      }));
      await probe.close();
      expect([r.wrapped, r.flag, r.stolen], [false, false, []], `on ${r.url}`);
    },
  );
  await check('Ghostfetch does nothing on sites that are not turned on', async () => {
    const probe = await context.newPage();
    // /steal grabs any port offer from its first script, so it would notice a bridge there.
    await probe.goto(`${EVIL_ORIGIN}/steal`);
    await sleep(600);
    const r = await probe.evaluate(async () => ({
      wrapped: !String(window.fetch).includes('[native code]'),
      mock: await fetch('/api/user?case=replace').then((x) => x.json()),
      stolen: window.stolen,
    }));
    expect([r.wrapped, r.mock.name, r.stolen], [false, 'Real', []]);
    await probe.close();
  });
  await check(
    'Traffic offers to turn Ghostfetch on for a site, and that works',
    async () => {
      const probe = await context.newPage();
      await probe.goto(`${EVIL_ORIGIN}/`);
      await show('traffic');
      const back = app.locator('[data-testid="request-back"]');
      if (await back.isVisible()) await back.click();
      // Page titles include the host (see the test server), so the evil.test tab is easy to pick.
      const label = `Test app on ${new URL(EVIL_ORIGIN).host}`;
      await app.click('[data-testid="traffic-tab"]');
      await app.getByRole('option', { name: label, exact: true }).click();
      await app.waitForSelector('[data-testid="enable-site"]', { timeout: 5000 });
      expect(
        await app.locator('[data-testid="traffic-notice"]').textContent(),
        "Ghostfetch is off on evil.test, so it doesn't capture or change anything there. Turn on for evil.test",
      );
      // Turning it on registers the content scripts for the site, then reloads the tab.
      const reloaded = probe.waitForEvent('load');
      await app.click('[data-testid="enable-site"]');
      await reloaded;
      expect(await probe.evaluate(() => window.early), { early: 'mocked' });
      const { sites } = await worker.evaluate(() => chrome.storage.local.get('sites'));
      expect(sites, ['evil.test']);
      await probe.close();
    },
  );
  await check(
    "the popup's Sites list the sites you added, and Remove turns one off",
    async () => {
      // A new popup, which lists the site added in the check before.
      const sitesPopup = await context.newPage();
      sitesPopup.on('pageerror', (error) => errors.push(`popup: ${error.message}`));
      sitesPopup.on(
        'console',
        (message) =>
          message.type() === 'error' && errors.push(`popup console: ${message.text()}`),
      );
      await sitesPopup.goto(`chrome-extension://${extensionId}/popup.html`);
      await sitesPopup.click('[data-testid="view-sites"]');
      await sitesPopup.waitForSelector('[data-testid="added-site"]');
      expect(await sitesPopup.locator('[data-testid="added-site"]').allTextContents(), [
        'evil.testRemove',
      ]);
      await sitesPopup.click('[data-testid="added-site"]:has-text("evil.test") button');
      await sitesPopup.waitForFunction(
        () => !document.querySelector('[data-testid="added-site"]'),
      );
      const { sites } = await worker.evaluate(() => chrome.storage.local.get('sites'));
      await sitesPopup.close();
      expect(sites, []);
    },
  );
  await check(
    'a script registered under its name up to 0.6.0 goes at the next sync',
    async () => {
      // As 0.6.0 may have left one: under its old id, for a site that has since been turned off.
      await worker.evaluate(() =>
        chrome.scripting.registerContentScripts([
          {
            id: 'mocktail-interceptor',
            js: ['interceptor.js'],
            matches: ['*://*.old.test/*'],
          },
        ]),
      );
      const ids = () =>
        worker.evaluate(() =>
          chrome.scripting
            .getRegisteredContentScripts()
            .then((scripts) => scripts.map((script) => script.id).toSorted()),
        );
      const settle = async (expected) => {
        let last;
        for (let tries = 0; tries < 30; tries++) {
          last = await ids();
          if (JSON.stringify(last) === JSON.stringify(expected)) break;
          await sleep(100);
        }
        return last;
      };
      await setStorage({ sites: ['example.org'] });
      const added = await settle(['ghostfetch-bridge', 'ghostfetch-interceptor']);
      await setStorage({ sites: [] });
      expect(
        [added, await settle([])],
        [['ghostfetch-bridge', 'ghostfetch-interceptor'], []],
      );
    },
  );
  await check(
    'Traffic turns Ghostfetch on for a host with an underscore in its name',
    async () => {
      // Up to 0.20.1 such a name (my_app.test, as a dev setup may call one) couldn't be a site,
      // though Chrome runs content scripts there: Turn on for my_app.test, and the popup's
      // switch, reloaded the tab and changed nothing.
      const origin = ORIGIN.replace('127.0.0.1', 'my_app.test');
      const probe = await context.newPage();
      await probe.goto(`${origin}/`);
      await show('traffic');
      const back = app.locator('[data-testid="request-back"]');
      if (await back.isVisible()) await back.click();
      await app.click('[data-testid="traffic-tab"]');
      await app
        .getByRole('option', { name: `Test app on ${new URL(origin).host}`, exact: true })
        .click();
      await app.waitForSelector('[data-testid="enable-site"]', { timeout: 5000 });
      const reloaded = probe.waitForEvent('load', { timeout: 5000 }).catch(() => {});
      await app.click('[data-testid="enable-site"]');
      await reloaded;
      const early = await probe.evaluate(() => window.early);
      const { sites } = await worker.evaluate(() => chrome.storage.local.get('sites'));
      await probe.close();
      await setStorage({ sites: [] });
      expect([early, sites], [{ early: 'mocked' }, ['my_app.test']]);
    },
  );

  console.log('editor details');
  const storedRules = async () =>
    (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules;
  await show('rules');
  await check(
    "an old Merge rule opens as Server's body, with no editor; Replace brings the editor",
    async () => {
      const row = app.locator('[data-testid="rule"]', { hasText: 'case=merge' }).first();
      const summary = await row.textContent();
      if (!summary.includes("Server's body"))
        throw new Error(`the list says: ${summary}`);
      await row.click();
      const state = async () => [
        await app.getAttribute('[data-testid="body-original"]', 'aria-checked'),
        await app.locator('.code').count(),
        (await storedRules()).find((r) => r.match.url === 'case=merge').response.bodyMode,
      ];
      // Storage says merge until the rules are next saved, all of them cleaned up (normalizeRule):
      // here, earlier checks have done that.
      expect(await state(), ['true', 0, 'original']);
      await app.click('[data-testid="body-replace"]');
      await app.waitForSelector('.code');
      await sleep(300);
      expect(await state(), ['false', 1, 'replace']);
      await app.click('[data-testid="body-original"]');
      await sleep(300);
      expect(await state(), ['true', 0, 'original']);
      // Still the server's body for the page.
      expect((await call('/api/user?case=merge')).body.role, 'user');
      // Saved, the rules have no type any more, and the redirect, header and block ones are gone.
      expect(
        (await storedRules()).filter((r) => 'type' in r || r.redirect || r.headers)
          .length,
        0,
        'old fields and types in storage',
      );
    },
  );
  await check(
    'a rule edited in another view shows in the open editor, but not over what you are typing in the body',
    async () => {
      await app
        .locator('[data-testid="rule"]', { hasText: 'case=replace' })
        .first()
        .click();
      await app.evaluate(() => document.activeElement?.blur());
      const original = await storedRules();
      const elsewhere = structuredClone(original);
      const index = elsewhere.findIndex((r) => r.match.url === '/api/user?case=replace');
      elsewhere[index].response.body = '{"from": "elsewhere"}';
      await setStorage({ rules: elsewhere });
      await app.waitForFunction(
        () => document.querySelector('.code textarea')?.value === '{"from": "elsewhere"}',
        null,
        { timeout: 3000 },
      );
      // Typing in the body: an edit from elsewhere leaves the text (and its undo history) alone.
      await body.click();
      await app.keyboard.press('End');
      await app.keyboard.type(' ');
      const typed = await body.inputValue();
      elsewhere[index].response.body = '{"from": "elsewhere again"}';
      await setStorage({ rules: elsewhere });
      await sleep(400);
      expect(await body.inputValue(), typed, 'while typing');
      await app.evaluate(() => document.activeElement?.blur());
      await setStorage({ rules: original });
      await sleep(300);
    },
  );
  await check(
    'dragging a rule onto the lower half of another moves it below that one, and saves the order',
    async () => {
      const ids = async () => (await storedRules()).map((r) => r.id);
      const before = await ids();
      const rows = app.locator('[data-testid="rule"]');
      await rows.nth(0).dragTo(rows.nth(2), { targetPosition: { x: 40, y: 50 } });
      await sleep(300);
      expect((await ids()).slice(0, 3), [before[1], before[2], before[0]]);
      await rows.nth(2).dragTo(rows.nth(0), { targetPosition: { x: 40, y: 5 } });
      await sleep(300);
      expect(await ids(), before, 'dragged back');
    },
  );
  await check(
    'the sidebar: Rules and Traffic with their counts; the rules in their order under how many are on, and one turned off stays in its place, greyed, and can still be dragged; + starts a new rule; "/" puts the cursor in the search field, but not from a field; Duplicate in a rule\'s header copies it',
    async () => {
      await show('rules');
      // The rows say which view is open, and count what's in it.
      const rows = () =>
        app.evaluate(() =>
          ['rules', 'traffic'].map((name) => {
            const row = document.querySelector(`[data-testid="nav-${name}"]`);
            return [row.getAttribute('aria-current') ?? '', row.textContent];
          }),
        );
      const original = await storedRules();
      const onRules = await rows();
      await show('traffic');
      const onTraffic = await rows();
      await show('rules');
      expect(
        [onRules.map(([current]) => current), onTraffic.map(([current]) => current)],
        [
          ['page', ''],
          ['', 'page'],
        ],
      );
      expect(onRules[0][1], `Rules${original.length}`, 'the count');

      // The second rule turned off elsewhere: it stays in its place, greyed (data-off), and the
      // heading over the list counts it.
      const listed = () =>
        app.evaluate(() => [
          document.querySelector('[data-testid="rule-list"] h2').textContent,
          [...document.querySelectorAll('[data-testid="rule"]')].map((row) => [
            row.dataset.url,
            row.hasAttribute('data-off'),
          ]),
        ]);
      const changed = structuredClone(original);
      changed[1].enabled = false;
      await setStorage({ rules: changed });
      await app.waitForFunction(
        (url) =>
          document.querySelector(`[data-testid="rule"][data-url="${url}"][data-off]`),
        changed[1].match.url,
        { timeout: 3000 },
      );
      expect(await listed(), [
        `${changed.filter((rule) => rule.enabled).length} of ${changed.length} on`,
        changed.map((rule) => [rule.match.url, !rule.enabled]),
      ]);
      // Off, it's dragged like any other: onto the lower half of the rule below it, it moves
      // below that one.
      const ruleRows = app.locator('[data-testid="rule"]');
      await ruleRows.nth(1).dragTo(ruleRows.nth(2), { targetPosition: { x: 40, y: 50 } });
      await sleep(300);
      expect(
        (await storedRules()).map((rule) => rule.id).slice(0, 3),
        [changed[0].id, changed[2].id, changed[1].id],
        'the rule that is off, dragged below the next',
      );
      await setStorage({ rules: original });
      await sleep(300);

      // +: New rule, with the cursor in it.
      await app.click('[data-testid="new-rule"]');
      await app.waitForFunction(
        () => document.activeElement?.dataset.testid === 'composer-input',
        null,
        { timeout: 3000 },
      );

      // "/" from the page puts the cursor in the search field; in a field it's a character.
      await app.locator('[data-testid="rule"]').first().click();
      await app.keyboard.press('/');
      const focused = await app.evaluate(() =>
        document.activeElement?.getAttribute('aria-label'),
      );
      await app.keyboard.type('x/');
      const search = app.locator('[aria-label="Search rules"]');
      const typed = await search.inputValue();
      await search.fill('');
      expect([focused, typed], ['Search rules', 'x/']);

      // Duplicate in the header: a copy, named "… (copy)", right after the rule, and open.
      await app.locator('[data-testid="rule"]').first().click();
      await app.click('[data-testid="duplicate-rule"]');
      await sleep(300);
      const now = await storedRules();
      const copy = now[1];
      expect(
        [
          now.length,
          copy.name.endsWith(' (copy)'),
          now[0].match.url === copy.match.url,
          await app.locator('[data-testid="rule-name"]').inputValue(),
        ],
        [original.length + 1, true, true, copy.name],
      );
      await app.click('[data-testid="rule-menu"]');
      await app.click('[data-testid="delete-rule"]');
      await sleep(300);
      expect((await storedRules()).length, original.length, 'the copy deleted');
    },
  );
  await check(
    'wide: in Traffic, a rule picked in the sidebar opens in the Rules view, which is then the view remembered',
    async () => {
      await show('traffic');
      const rule = (await storedRules())[1];
      await app.click(`[data-testid="rule"][data-url="${rule.match.url}"]`);
      // The Rules view comes over Traffic, rather than the rule opening under it.
      await app
        .locator('[data-testid="view-traffic"]')
        .waitFor({ state: 'hidden', timeout: 3000 });
      const name = app.locator('[data-testid="rule-name"]');
      expect(
        [
          await app.locator('[data-testid="nav-rules"]').getAttribute('aria-current'),
          await name.evaluate((field) => field.value || field.placeholder),
          await app.evaluate(() => localStorage.getItem('ghostfetch.view')),
        ],
        ['page', rule.name || rule.match.url, 'rules'],
      );
    },
  );
  await check(
    'Add header puts the cursor in the new row, and what you type is saved',
    async () => {
      await app
        .locator('[data-testid="rule"]', { hasText: 'case=replace' })
        .first()
        .click();
      await app.click('[data-testid="row-headers"]');
      await app.getByRole('button', { name: 'Add header' }).click();
      expect(
        await app.evaluate(() => [
          document.activeElement?.getAttribute('aria-label'),
          document.activeElement?.value,
        ]),
        ['Header name', ''],
      );
      await app.keyboard.type('X-Added');
      await sleep(400);
      const rule = (await storedRules()).find(
        (r) => r.match.url === '/api/user?case=replace',
      );
      expect(
        rule.response.headers.map((row) => row.name),
        ['X-Mock', 'X-Added'],
      );
      await app.getByRole('button', { name: 'Remove header' }).last().click();
    },
  );
  await check(
    "header rows the browser won't let through are marked as skipped, and the page gets the rest",
    async () => {
      // Up to 0.20.1 the row said "Sets 4" and nothing more, and a mocked XMLHttpRequest showed
      // the page a Set-Cookie, which no real one ever does.
      const got = await page.evaluate(async () => {
        const response = await fetch('/api/user?case=bad-headers');
        const fromFetch = ['x-ok', 'x-greeting', 'set-cookie'].map((name) =>
          response.headers.get(name),
        );
        const fromXhr = await new Promise((resolve) => {
          const request = new XMLHttpRequest();
          request.open('GET', '/api/user?case=bad-headers');
          request.addEventListener('loadend', () =>
            resolve([
              request.getResponseHeader('x-ok'),
              request.getResponseHeader('set-cookie'),
              /set-cookie/i.test(request.getAllResponseHeaders()),
            ]),
          );
          request.send();
        });
        return { fromFetch, fromXhr };
      });
      await show('rules');
      await app
        .locator('[data-testid="rule"]', { hasText: 'case=bad-headers' })
        .first()
        .click();
      await app.click('[data-testid="row-headers"]');
      const said = {
        row: await app.locator('[data-testid="row-headers-value"]').textContent(),
        hints: await app
          .locator('[data-slot="card-hint"][data-tone="bad"]')
          .allTextContents(),
      };
      expect(got, { fromFetch: ['yes', null, null], fromXhr: ['yes', null, false] });
      expect(said, {
        row: '✗ 3 of 4 skipped',
        hints: [
          "Skipped: “П” can't be in a header, which takes Latin-1 text only",
          "Skipped: a header name can't have “:” in it",
          "Skipped: a page never sees Set-Cookie, so a mock can't set a cookie",
        ],
      });
    },
  );
  await check(
    'a header row is skipped exactly when the browser would refuse it, for 182 names and values',
    async () => {
      // The editor and the page both go by headerProblem(); this is what Chrome does with the
      // same header in a Response, the name trimmed as the page's script trims it.
      const names = [
        'X-Ok',
        'x-ok',
        'Content-Type',
        'Content-Type:',
        'Bad Name',
        'X_Under',
        "X'Quote",
        'X.Dot',
        'X(Paren)',
        'Ünicode',
        'X\tTab',
        'Set-Cookie',
        'set-cookie2',
        'X~`|^',
      ];
      const values = [
        'yes',
        'café',
        'Привет',
        '😀',
        'a\nb',
        'a\rb',
        'a\0b',
        'a\tb',
        ' padded ',
        '',
        'ÿ',
        'Ā',
        '\u0085',
      ];
      const pairs = names.flatMap((name) => values.map((value) => [name, value]));
      const kept = await page.evaluate(
        (list) =>
          list.map(([name, value]) => {
            try {
              const response = new Response('', { headers: [[name.trim(), value]] });
              return response.headers.get(name.trim()) !== null;
            } catch {
              return false;
            }
          }),
        pairs,
      );
      const disagree = pairs.filter(
        ([name, value], index) =>
          (headerProblem({ op: 'set', name, value }) === '') !== kept[index],
      );
      expect([pairs.length, disagree], [182, []]);
    },
  );
  await check('a rule picked in the popup opens in the editor', async () => {
    const rule = (await storedRules()).find((r) => r.match.url === 'case=delay');
    await worker.evaluate((id) => chrome.storage.session.set({ focusRule: id }), rule.id);
    // The rule's name says which rule is open: unnamed, it shows the URL.
    await app.waitForFunction(
      () =>
        document.querySelector('[data-testid="rule-name"]')?.placeholder === 'case=delay',
      null,
      { timeout: 3000 },
    );
  });
  await check(
    "a rule's dot in the list turns it off and on and saves it, without opening it; one that's off is greyed, and open, its chip says Off",
    async () => {
      // The rule the check before opened (unnamed, so the list shows its URL), and another.
      const open = app.locator('[data-testid="rule"][data-url="case=delay"]');
      const other = app.locator('[data-testid="rule"][data-url="case=method"]');
      const stored = async (url) =>
        (await storedRules()).find((rule) => rule.match.url === url).enabled;
      // What the dot says, what's saved, whether the row is greyed, and the open rule's chip.
      const state = async () => [
        (await open.locator('[role="switch"]').getAttribute('aria-checked')) === 'true',
        await stored('case=delay'),
        (await open.getAttribute('data-off')) !== null,
        (await app.textContent('[data-testid="rule-state"]')).startsWith('Off'),
      ];
      const flip = async (row) => {
        await row.locator('[role="switch"]').click();
        // The editor saves a moment after a change.
        await sleep(400);
      };
      const was = await state();
      await flip(open);
      const flipped = await state();
      await flip(open);
      const back = await state();
      // Another rule's dot turns that rule, and the open one stays open.
      const otherWas = await stored('case=method');
      await flip(other);
      const otherFlipped = await stored('case=method');
      await flip(other);
      const on = was[0];
      expect(
        [
          was,
          flipped,
          back,
          otherFlipped === !otherWas,
          (await open.getAttribute('data-selected')) !== null,
        ],
        [[on, on, !on, !on], [!on, !on, on, on], [on, on, !on, !on], true, true],
      );
    },
  );
  await check(
    'Traffic: Matched and Errors filter the log, Keep on reload keeps it over a reload, Clear empties it',
    async () => {
      await show('traffic');
      await app.click('[data-testid="traffic-tab"]');
      await app
        .getByRole('option', { name: `Test app on ${new URL(ORIGIN).host}`, exact: true })
        .click();
      await page.reload();
      await page.evaluate(() => window.early);
      await page.evaluate(() => fetch('/api/user?case=none'));
      // The test server answers a path it doesn't know with a 404.
      await page.evaluate(() => fetch('/api/nowhere'));
      await app.waitForSelector('[data-testid="request"]:has-text("/api/nowhere")', {
        timeout: 3000,
      });
      const count = () => app.locator('[data-testid="request"]').count();
      const all = await count();
      await app.click('[data-testid="filter-matched"]');
      expect(
        [
          await count(),
          await app.locator('[data-testid="request"]', { hasText: 'case=none' }).count(),
        ],
        [all - 2, 0],
        'Matched',
      );
      // Errors: a status of 400 or more, a request that failed or a rule's error, and as many as
      // its pill says.
      await app.click('[data-testid="filter-errors"]');
      const failed = await app.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-testid="request"]')];
        return {
          shown: rows.length,
          counted: Number(
            document.querySelector('[data-testid="filter-errors"] span').textContent,
          ),
          notErrors: rows.filter(
            (row) =>
              !/^(ERR|[45]\d\d)$/.test(
                row.querySelector('[data-slot="status"]').textContent,
              ) && !row.textContent.includes('Rule error'),
          ).length,
          nowhere: rows.some((row) => row.textContent.includes('/api/nowhere')),
        };
      });
      if (
        failed.shown < 1 ||
        failed.shown !== failed.counted ||
        failed.notErrors ||
        !failed.nowhere
      )
        throw new Error(`Errors: ${JSON.stringify(failed)}`);
      await app.click('[data-testid="filter-all"]');
      expect(await count(), all, 'All');
      await app.getByRole('button', { name: 'Keep on reload' }).click();
      await page.reload();
      await page.evaluate(() => window.early);
      await app.waitForFunction(
        (before) => document.querySelectorAll('[data-testid="request"]').length > before,
        all,
        { timeout: 3000 },
      );
      await app.getByRole('button', { name: 'Keep on reload' }).click();
      await app.getByRole('button', { name: 'Clear the log' }).click();
      // The log redraws once a frame, however many requests arrive; then the count in the tab goes.
      await app.waitForFunction(
        () =>
          !document.querySelector('[data-testid="request"]') &&
          document.querySelector('[data-testid="tab-traffic"]').textContent ===
            'Traffic ',
        null,
        { timeout: 3000 },
      );
    },
  );
  await check(
    "Traffic says whether it's recording, with nothing there to switch it: the toolbar popup does",
    async () => {
      const status = app.locator('[data-testid="record"]');
      const said = async () => [
        await status.evaluate((element) => element.tagName),
        await status.textContent(),
      ];
      const recording = await said();
      // Stopped as the popup's Recording does, in storage.
      await setStorage({ record: false });
      await sleep(400);
      const stopped = [
        ...(await said()),
        await app.textContent('[data-testid="traffic-notice"]'),
      ];
      await setStorage({ record: true });
      await sleep(400);
      expect(
        [recording, stopped],
        [
          ['SPAN', 'Recording'],
          [
            'SPAN',
            'Not recording',
            'Recording is off, so new requests aren’t captured. Rules still apply. Start recording in the toolbar popup.',
          ],
        ],
      );
    },
  );
  await check(
    'editor settings saved under their names up to 0.6.0 carry over',
    async () => {
      await app.evaluate(() => {
        for (const name of ['vim', 'view', 'preserveLog']) {
          localStorage.removeItem(`ghostfetch.${name}`);
          localStorage.setItem(`mocktail.${name}`, name === 'view' ? 'traffic' : '1');
        }
      });
      await app.reload();
      await app.waitForSelector('[data-testid="nav-traffic"][aria-current="page"]');
      const saved = await app.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => /^(mocktail|ghostfetch)\./.test(key))
          .toSorted()
          .map((key) => `${key}=${localStorage.getItem(key)}`),
      );
      const preserve = await app
        .getByRole('button', { name: 'Keep on reload' })
        .getAttribute('aria-pressed');
      expect(
        [saved, preserve],
        [
          ['ghostfetch.preserveLog=1', 'ghostfetch.view=traffic', 'ghostfetch.vim=1'],
          'true',
        ],
      );
    },
  );

  // Traffic watching a tab of its own: the tab picker's option for it.
  const watch = async (title) => {
    await show('traffic');
    await app.click('[data-testid="traffic-tab"]');
    await app
      .getByRole('option', { name: `${title} on ${new URL(ORIGIN).host}`, exact: true })
      .click();
  };
  await check(
    "a stream that doesn't end shows in Traffic with its first 1 MB, and the page still gets the rest",
    async () => {
      // Up to 0.20.0 the copy Ghostfetch reads was read to its end, which this never reaches: no
      // entry, and the whole stream so far held in the tab.
      const stream = await context.newPage();
      await stream.goto(`${ORIGIN}/stream`);
      await watch('Stream');
      const row = app.locator('[data-testid="request"]', { hasText: '/api/stream' });
      await row.waitFor({ timeout: 5000 });
      await row.click();
      const kept = await app
        .locator('[data-testid="request-detail"]')
        .getByText('the first 1 MB')
        .count();
      const before = await stream.evaluate(() => window.received);
      await sleep(400);
      const after = await stream.evaluate(() => window.received);
      await stream.close();
      expect([kept, before > 1_000_000, after > before], [1, true, true]);
    },
  );
  await check(
    'Traffic shows a log longer than Chrome passes in one message (64 MiB): 70 responses of 1 MB',
    async () => {
      // Up to 0.20.0 the log so far went over as one message, which Chrome refused: no requests.
      const heavy = await context.newPage();
      await heavy.goto(`${ORIGIN}/heavy`);
      await heavy.evaluate(() => window.done);
      await watch('Heavy app');
      const rows = app.locator('[data-testid="request"]', { hasText: '/api/heavy/' });
      await rows.nth(69).waitFor({ timeout: 8000 });
      const count = await rows.count();
      await heavy.close();
      expect(count, 70);
    },
  );
  await check(
    "Clear, while a long log is still arriving, empties Traffic as it does the page's log",
    async () => {
      // Up to 0.20.1 the parts of the log so far still on their way after Clear put their
      // requests back: Traffic listed them, though the page's own log no longer had them.
      const heavy = await context.newPage();
      await heavy.goto(`${ORIGIN}/heavy`);
      await heavy.evaluate(() => window.done);
      // Clear is clicked the moment the first of its requests is drawn, the rest still on their way.
      await app.evaluate(() => {
        const observer = new MutationObserver(() => {
          const drawn = [
            ...document.querySelectorAll('[data-testid="request-path"]'),
          ].some((shown) => shown.textContent.startsWith('/api/heavy/'));
          if (!drawn) return;
          observer.disconnect();
          window.clearedWith = document.querySelectorAll(
            '[data-testid="request"]',
          ).length;
          document.querySelector('button[aria-label="Clear the log"]').click();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      await watch('Heavy app');
      await app.waitForFunction(() => window.clearedWith !== undefined, null, {
        timeout: 8000,
      });
      await sleep(3000);
      const listed = await app.locator('[data-testid="request"]').count();
      const clearedWith = await app.evaluate(() => window.clearedWith);
      await heavy.close();
      expect(listed, 0, `Clear clicked with ${clearedWith} of 70 drawn`);
    },
  );
  await check(
    'Keep on reload keeps the last 500 requests, however often a page that asks for a lot as it starts reloads',
    async () => {
      // Up to 0.20.1 what a page had asked for before Traffic connected to it again after a
      // reload was added to the requests kept with no limit: 150 more with each reload here,
      // and so on for as long as the editor stayed open.
      const burst = await context.newPage();
      await burst.goto(`${ORIGIN}/burst`);
      await burst.evaluate(() => window.done);
      await watch('Burst');
      const keep = app.getByRole('button', { name: 'Keep on reload' });
      const was = await keep.getAttribute('aria-pressed');
      if (was !== 'true') await keep.click();
      for (let reload = 0; reload < 5; reload++) {
        await burst.reload();
        await burst.evaluate(() => window.done);
        await sleep(500);
      }
      const listed = await app.locator('[data-testid="request"]').count();
      if (was !== 'true') await keep.click();
      await burst.close();
      expect(listed, 500, 'requests listed, of the 900 the page made');
    },
  );
  await check(
    "an iframe's requests reach the tab's log: one a rule answers and one no rule answers are both in Traffic for the tab, and the popup's counts for the tab include the one answered, and when",
    async () => {
      // An iframe's bridge sends each request it logs to the background, which passes it on to
      // the tab's top frame (src/app/background/on-message.ts), whose log is the tab's
      // (src/bounded-contexts/traffic/infrastructure/tab-log.ts): the log Traffic reads and the
      // popup's counts come from. The test server's /framed asks for nothing itself, and its
      // iframe is on another host Ghostfetch runs on (LOCAL_ORIGIN), so all the tab has is the
      // iframe's.
      const framed = await context.newPage();
      try {
        await framed.goto(`${ORIGIN}/framed`);
        const frame = await (await framed.waitForSelector('iframe')).contentFrame();
        const tab = (await worker.evaluate(() => chrome.tabs.query({}))).find(
          (candidate) => candidate.url === framed.url(),
        );
        // The rule that answers /api/early, as it's stored.
        const early = (await storedRules()).find(
          (rule) => rule.match.url === '/api/early',
        );
        // In the iframe, one after the other: a request that rule answers, and one no rule does.
        const sent = Date.now();
        const [answered, unanswered] = await frame.evaluate(async () => {
          const got = [];
          for (const target of [
            '/api/early?in-frame=answered',
            '/api/user?in-frame=unanswered',
          ]) {
            const response = await fetch(target);
            got.push([response.status, await response.text()]);
          }
          return got;
        });
        await watch('Framed app');
        // The requests Traffic lists for the tab: each one's URL, and what a rule did to it.
        const listed = () =>
          app.evaluate(() =>
            [...document.querySelectorAll('[data-testid="request"]')]
              .map((row) => [
                row.title,
                row.querySelector('[data-testid="request-action"]')?.textContent ?? '',
              ])
              .toSorted(),
          );
        // What the popup is told of the tab: how often each rule answered there, and when each
        // last did, here whether that's a time since the iframe's requests were sent.
        const counted = () =>
          worker
            .evaluate(
              (id) =>
                chrome.tabs.sendMessage(
                  id,
                  { type: 'ghostfetch:counts' },
                  { frameId: 0 },
                ),
              tab.id,
            )
            .then((counts) => ({
              ...counts,
              last: Object.fromEntries(
                Object.entries(counts.last).map(([id, time]) => [
                  id,
                  time >= sent && time <= Date.now(),
                ]),
              ),
            }));
        const LISTED = [
          [`${LOCAL_ORIGIN}/api/early?in-frame=answered`, 'Mocked'],
          [`${LOCAL_ORIGIN}/api/user?in-frame=unanswered`, ''],
        ];
        const COUNTED = {
          record: true,
          rules: { [early.id]: { mocked: 1, modified: 0, failed: 0 } },
          last: { [early.id]: true },
        };
        expect(
          [
            [answered, [unanswered[0], JSON.parse(unanswered[1]).name]],
            await settled(listed, same(LISTED)),
            await settled(counted, same(COUNTED)),
          ],
          [
            [
              [200, early.response.body],
              [200, 'Real'],
            ],
            LISTED,
            COUNTED,
          ],
        );
      } finally {
        await framed.close();
      }
    },
  );
  await check(
    'when the page Traffic watches is closed, it watches the page used last and lists its requests',
    async () => {
      // Up to 0.20.1 the page picker took its list's own reset (its page gone from the list) for a
      // choice of no page at all: "Open a web page in this window", with the test app still open.
      await page.bringToFront();
      const control = await context.newPage();
      await control.goto(`${ORIGIN}/__control`);
      await show('traffic');
      await app.click('[data-testid="traffic-tab"]');
      await app.getByRole('option', { name: 'control', exact: true }).click();
      await control.close();
      await sleep(500);
      await page.evaluate(() => fetch('/api/user?case=after-close'));
      const row = app.locator('[data-testid="request"]', { hasText: 'case=after-close' });
      await row.waitFor({ timeout: 3000 }).catch(() => {});
      expect(
        [await row.count(), await app.locator('[data-testid="traffic-notice"]').count()],
        [1, 0],
        `watching: ${(await app.locator('[data-testid="traffic-tab"]').textContent()).trim()}`,
      );
    },
  );

  await check(
    'when the page Traffic watches leaves the web, it watches the page used last, not one that is gone',
    async () => {
      // Up to 0.20.1 Traffic went on naming the page it had watched, and said Ghostfetch wasn't
      // running in that tab yet ("Reload the page"): Chrome tells an extension neither the URL
      // nor the title of a page it can't see, and those were all that made Traffic look again.
      await page.bringToFront();
      const leaving = await context.newPage();
      await leaving.goto(`${ORIGIN}/__control`);
      await show('traffic');
      await app.click('[data-testid="traffic-tab"]');
      await app.getByRole('option', { name: 'control', exact: true }).click();
      await sleep(300);
      await leaving.goto('about:blank');
      await sleep(1200);
      await page.evaluate(() => fetch('/api/user?case=after-leaving'));
      const row = app.locator('[data-testid="request"]', {
        hasText: 'case=after-leaving',
      });
      await row.waitFor({ timeout: 3000 }).catch(() => {});
      const watching = (
        await app.locator('[data-testid="traffic-tab"]').textContent()
      ).trim();
      const seen = [
        await row.count(),
        await app.locator('[data-testid="traffic-notice"]').count(),
      ];
      await leaving.close();
      expect(seen, [1, 0], `watching: ${watching}`);
    },
  );
  await check(
    'the side panel follows its tab when that opens a web page, and lists its requests; a page picked by hand stays',
    async () => {
      // The editor as the side panel has it: chrome.tabs.getCurrent() answers undefined there,
      // and Traffic follows the window's active tab. Up to 0.20.1 it followed a tab you switched
      // to, but not the tab you were on when that opened a page: a new tab, then your app's
      // address in it, left Traffic on the page before, or on "No web pages open".
      const panel = await context.newPage();
      panel.on('pageerror', (error) => errors.push(`panel: ${error.message}`));
      await panel.addInitScript(() => {
        chrome.tabs.getCurrent = async () => undefined;
      });
      await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await panel
        .locator(
          '[data-testid="nav-traffic"]:visible, [data-testid="tab-traffic"]:visible',
        )
        .first()
        .click();
      // A new tab, the active one, on no web page yet.
      const fresh = await context.newPage();
      await fresh.bringToFront();
      await sleep(600);
      await fresh.goto(`${ORIGIN}/__control`);
      await panel
        .waitForFunction(
          () =>
            document
              .querySelector('[data-testid="traffic-tab"]')
              .textContent.includes('control'),
          null,
          { timeout: 3000 },
        )
        .catch(() => {});
      const watching = (
        await panel.locator('[data-testid="traffic-tab"]').textContent()
      ).trim();
      await fresh.evaluate(() => fetch('/api/user?case=followed').then((r) => r.text()));
      const row = panel.locator('[data-testid="request"]', { hasText: 'case=followed' });
      await row.waitFor({ timeout: 3000 }).catch(() => {});
      const listed = await row.count();

      // A page you pick by hand is another matter: it stays the one watched while the panel's
      // own tab moves on (an app's router changing the address, another page loaded), until you
      // switch tabs.
      const title = `Test app on ${new URL(ORIGIN).host}`;
      await panel.click('[data-testid="traffic-tab"]');
      await panel.getByRole('option', { name: title, exact: true }).first().click();
      await fresh.bringToFront();
      await fresh.evaluate(() => history.pushState({}, '', '/__control?moved=1'));
      await sleep(700);
      await fresh.goto(`${ORIGIN}/__control?loaded=1`);
      await sleep(900);
      const kept = (
        await panel.locator('[data-testid="traffic-tab"]').textContent()
      ).trim();
      await fresh.close();
      await panel.close();
      expect(
        [watching.includes('control'), listed, kept.includes(title)],
        [true, 1, true],
        `followed to: ${watching}; picked by hand, then: ${kept}`,
      );
    },
  );

  console.log('groups');
  const storedGroups = async () =>
    (await worker.evaluate(() => chrome.storage.local.get({ groups: [] }))).groups;
  // A rule for these checks, named "From …", answering /api/user?case=grouped with { from }.
  const grouped = (id, from, group = '', patch = {}) => ({
    ...createRule(),
    id,
    name: `From ${from}`,
    group,
    match: {
      url: '/api/user?case=grouped',
      mode: 'contains',
      method: 'ANY',
      graphqlOperation: '',
    },
    response: { ...createRule().response, body: JSON.stringify({ from }) },
    ...patch,
  });
  const PR1 = (patch = {}) => ({
    id: 'g-1',
    name: 'PR-1',
    enabled: true,
    at: 1,
    ...patch,
  });
  // The editor's list as it draws it: each group's header and each rule's name, in order.
  const listed = () =>
    app.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="rule-list"] [data-testid="rule"], [data-testid="rule-list"] [data-testid="group"]',
        ),
      ].map((row) =>
        row.dataset.testid === 'group'
          ? `group ${row.dataset.group}`
          : row.querySelector('[data-slot="item-title"]').textContent,
      ),
    );
  // Sets rules and groups for a check and puts the suite's own back after it.
  const withGroups = async (rules, groups, run) => {
    const original = await storedRules();
    await setStorage({ rules, groups });
    await sleep(400);
    try {
      await run();
    } finally {
      await setStorage({ rules: original, groups: [] });
      await sleep(400);
    }
  };

  await check(
    "a group's rules answer only while it's on, in the order: of two groups whose rules match a request the higher one's answers, and an ungrouped rule under them once both are off; a group's switch applies at once, the page follows the order the editor shows, and the badge counts only the rules that answer",
    async () => {
      const groups = (one, two, flip = false) => [
        { id: 'g-a', name: 'PR-1', enabled: one, at: flip ? 1 : 0 },
        { id: 'g-b', name: 'PR-2', enabled: two, at: flip ? 0 : 1 },
      ];
      const seen = [];
      const look = async (stored) => {
        await setStorage(stored);
        await sleep(400);
        seen.push([
          (await call('/api/user?case=grouped')).body?.from,
          await worker.evaluate(() => chrome.action.getBadgeText({})),
        ]);
      };
      await withGroups(
        [grouped('ga', 'A', 'g-a'), grouped('gb', 'B', 'g-b'), grouped('gu', 'loose')],
        groups(true, true),
        async () => {
          await look({ groups: groups(true, true) });
          await look({ groups: groups(false, true) });
          await look({ groups: groups(false, false) });
          // PR-2 above PR-1, as the editor lists them, though the rules are kept as they were.
          await look({ groups: groups(true, true, true) });
        },
      );
      expect(seen, [
        ['A', '3'],
        ['B', '2'],
        ['loose', '1'],
        ['B', '3'],
      ]);
    },
  );

  await check(
    "the sidebar draws a group as a block: its header, its dot where an ungrouped rule's is, its name and how many of its rules are on, then its rules set in; turned off, it and its rules fade, their dots green but still and the open rule's chip saying so; its name folds it, kept when the editor opens again; a search shows a group with the rules of it that match, or all of them when its name matches",
    async () => {
      await withGroups(
        [
          grouped('u1', 'one'),
          grouped('a1', 'A1', 'g-1'),
          grouped('a2', 'A2', 'g-1', { enabled: false }),
          grouped('u2', 'two'),
        ],
        [PR1()],
        async () => {
          await show('rules');
          const header = app.locator('[data-testid="group"][data-group="PR-1"]');
          await header.waitFor({ timeout: 3000 });
          const order = await listed();
          const dots = await app.evaluate(() => {
            const left = (row) =>
              row.querySelector('[role="switch"]').getBoundingClientRect().left;
            const rule = (name) =>
              [...document.querySelectorAll('[data-testid="rule"]')].find((row) =>
                row.textContent.includes(name),
              );
            return [
              left(document.querySelector('[data-testid="group"]')),
              left(rule('From one')),
              left(rule('From A1')),
            ];
          });
          const count = await header.locator('[data-testid="group-count"]').textContent();
          const a1 = app.locator('[data-testid="rule"]', { hasText: 'From A1' });
          await a1.click();
          await header.locator('[role="switch"]').click();
          await sleep(300);
          const dot = a1.locator('[role="switch"]');
          const off = [
            (await storedGroups())[0].enabled,
            await header.evaluate((row) => row.hasAttribute('data-off')),
            await a1.evaluate((row) => row.hasAttribute('data-off')),
            await dot.getAttribute('aria-checked'),
            await dot.evaluate((element) =>
              element.firstElementChild
                .getAnimations()
                .some((animation) => animation.animationName === 'signal-pulse'),
            ),
            await app.locator('[data-testid="rule-state"]').textContent(),
            (await app.locator('[data-testid="rules-head-path"]').textContent())
              .replace(/\s+/g, ' ')
              .trim(),
          ];
          await header.locator('[role="switch"]').click();
          await sleep(300);
          await header.locator('[data-testid="group-name"]').click();
          const folded = await listed();
          await app.reload();
          await app.waitForSelector('[data-testid="group"]');
          const reopened = await listed();
          await app.click(
            '[data-testid="group"][data-group="PR-1"] [data-testid="group-name"]',
          );
          const search = app.locator('[aria-label="Search rules"]');
          await search.fill('A1');
          const found = await listed();
          await search.fill('pr-1');
          const byName = await listed();
          await search.fill('');
          expect(
            [
              order,
              Math.abs(dots[0] - dots[1]) < 1,
              Math.round(dots[2] - dots[1]),
              count,
              off,
              folded,
              reopened,
              found,
              byName,
            ],
            [
              ['From one', 'group PR-1', 'From A1', 'From A2', 'From two'],
              true,
              14,
              '1 of 2 on',
              [
                false,
                true,
                true,
                'true',
                false,
                'Paused while PR-1 is off',
                'Rules / PR-1 / From A1',
              ],
              ['From one', 'group PR-1', 'From two'],
              ['From one', 'group PR-1', 'From two'],
              ['group PR-1', 'From A1'],
              ['group PR-1', 'From A1', 'From A2'],
            ],
          );
        },
      );
    },
  );

  await check(
    "New group makes one at the top, its name ready to type; Move to group puts a rule at the group's top; the group's + makes a rule at its top, and New rule then offers that group to the next rule; a name another group has, in any case, is turned down",
    async () => {
      await withGroups([grouped('u1', 'one'), grouped('u2', 'two')], [], async () => {
        await show('rules');
        await app.waitForSelector('[data-testid="rule"]');
        await app.click('[data-testid="new-group"]');
        const field = app.locator('[data-testid="group-name-input"]');
        await field.waitFor({ timeout: 3000 });
        const ready = await field.evaluate(
          (input) =>
            input === document.activeElement &&
            input.selectionStart === 0 &&
            input.selectionEnd === input.value.length &&
            input.value,
        );
        await field.fill('PR-7');
        await field.press('Enter');
        await sleep(300);
        const [made] = await storedGroups();
        await app.locator('[data-testid="rule"]', { hasText: 'From two' }).click();
        await app.click('[data-testid="rule-menu"]');
        await app.click('[data-testid="move-to-group"]');
        await app.click('[data-testid="move-to"][data-group="PR-7"]');
        await sleep(300);
        const moved = (await storedRules()).map((rule) => [
          rule.id,
          rule.group === made.id,
        ]);
        await app.click(
          '[data-testid="group"][data-group="PR-7"] [data-testid="group-new-rule"]',
        );
        await app.waitForFunction(
          () => document.activeElement?.dataset.testid === 'composer-input',
          null,
          { timeout: 3000 },
        );
        const offered = await app.locator('[data-testid="picker-group"]').textContent();
        await app.keyboard.type('/api/user?case=in-group');
        await app.keyboard.press('Enter');
        await sleep(400);
        const [first] = await storedRules();
        await app.click('[data-testid="new-rule"]');
        const next = await app.locator('[data-testid="picker-group"]').textContent();
        await app.click('[data-testid="new-group"]');
        await field.waitFor({ timeout: 3000 });
        await field.fill('pr-7');
        await field.press('Enter');
        const refused = await app
          .locator('[data-slot="toast"]', { hasText: 'already a group called' })
          .waitFor({ timeout: 3000 })
          .then(
            () => true,
            () => false,
          );
        await field.press('Escape');
        await sleep(300);
        expect(
          [
            ready,
            [made.name, made.at, made.enabled],
            moved,
            offered,
            [first.match.url, first.group === made.id],
            next,
            refused,
            (await storedGroups()).map((group) => group.name),
          ],
          [
            'New group',
            ['PR-7', 0, true],
            [
              ['u2', true],
              ['u1', false],
            ],
            'PR-7',
            ['/api/user?case=in-group', true],
            'PR-7',
            true,
            ['New group', 'PR-7'],
          ],
        );
      });
    },
  );

  await check(
    "a group's Duplicate copies it with its rules and their switches, on, at the top, named … copy and ready to rename; Delete takes it with its rules, and Undo brings them back where they were; Ungroup leaves its rules where it was",
    async () => {
      await withGroups(
        [
          grouped('u1', 'one'),
          grouped('a1', 'A1', 'g-1'),
          grouped('a2', 'A2', 'g-1', { enabled: false }),
        ],
        [PR1()],
        async () => {
          await show('rules');
          const menu = async (name, item) => {
            await app.click(
              `[data-testid="group"][data-group="${name}"] [data-testid="group-menu"]`,
            );
            await app.click(`[data-testid="${item}"]`);
            await sleep(300);
          };
          await app
            .locator('[data-testid="group"][data-group="PR-1"]')
            .waitFor({ timeout: 3000 });
          await menu('PR-1', 'duplicate-group');
          const renaming = await app
            .locator('[data-testid="group-name-input"]')
            .inputValue();
          await app.keyboard.press('Escape');
          const copy = (await storedGroups()).find((group) => group.name === 'PR-1 copy');
          const copies = (await storedRules())
            .filter((rule) => rule.group === copy.id)
            .map((rule) => [rule.name, rule.enabled, !['a1', 'a2'].includes(rule.id)]);
          await menu('PR-1 copy', 'delete-group');
          const gone = [(await storedGroups()).length, (await storedRules()).length];
          await app.click(
            '[data-slot="toast"]:has-text("Deleted “PR-1 copy” and its 2 rules") button:has-text("Undo")',
          );
          await sleep(300);
          const back = [
            (await storedGroups()).map((group) => [group.name, group.at]),
            (await storedRules()).length,
          ];
          await menu('PR-1', 'ungroup');
          const left = [
            (await storedGroups()).map((group) => group.name),
            (await storedRules()).slice(2).map((rule) => [rule.id, rule.group]),
          ];
          expect(
            [renaming, [copy.at, copy.enabled], copies, gone, back, left],
            [
              'PR-1 copy',
              [0, true],
              [
                ['From A1', true, true],
                ['From A2', false, true],
              ],
              [1, 3],
              [
                [
                  ['PR-1 copy', 0],
                  ['PR-1', 2],
                ],
                5,
              ],
              [
                ['PR-1 copy'],
                [
                  ['u1', ''],
                  ['a1', ''],
                  ['a2', ''],
                ],
              ],
            ],
          );
        },
      );
    },
  );

  await check(
    "dragging: a rule onto a group's header, below its middle, goes to the top of the group; onto an ungrouped rule, out of it; a group's header onto an ungrouped rule moves the group with its rules",
    async () => {
      await withGroups(
        [grouped('u1', 'one'), grouped('a1', 'A1', 'g-1'), grouped('u2', 'two')],
        [PR1()],
        async () => {
          await show('rules');
          const header = app.locator('[data-testid="group"][data-group="PR-1"]');
          await header.waitFor({ timeout: 3000 });
          const row = (name) => app.locator('[data-testid="rule"]', { hasText: name });
          const shape = async () =>
            (await storedRules()).map((rule) => [rule.id, rule.group ? 'PR-1' : '']);
          // What's left of a drag once it's dropped: a drop mark, or something faded as being
          // dragged. Up to 0.25.0 a rule moved into a group or out of one kept both, the group's
          // header outlined and the rule faded: its row was drawn anew in another list, and the
          // browser's dragend went to the row taken out, which React no longer hears.
          const leftovers = () =>
            app.evaluate(() =>
              [
                ...document.querySelectorAll(
                  '[data-testid="rule-list"] [data-drop], [data-testid="rule-list"] .opacity-40',
                ),
              ].map((element) => element.dataset.testid),
            );
          await row('From two').dragTo(header, { targetPosition: { x: 60, y: 30 } });
          await sleep(300);
          const into = [await shape(), await leftovers()];
          await row('From A1').dragTo(row('From one'), {
            targetPosition: { x: 60, y: 5 },
          });
          await sleep(300);
          const out = [await shape(), await leftovers()];
          await header.dragTo(row('From A1'), { targetPosition: { x: 60, y: 5 } });
          await sleep(300);
          expect(
            [into, out, await shape(), (await storedGroups())[0].at, await leftovers()],
            [
              [
                [
                  ['u1', ''],
                  ['u2', 'PR-1'],
                  ['a1', 'PR-1'],
                ],
                [],
              ],
              [
                [
                  ['a1', ''],
                  ['u1', ''],
                  ['u2', 'PR-1'],
                ],
                [],
              ],
              [
                ['u2', 'PR-1'],
                ['a1', ''],
                ['u1', ''],
              ],
              0,
              [],
            ],
          );
        },
      );
    },
  );

  await check(
    "while a rule is dragged, a mark shows only where it would land: a line in a group starts under its rules' dots, one out of any group is as wide as the list; none over the list's label or out of the list (up to 0.25.0 the last one stayed); under a list that ends with a group, the rule goes to the end of the list, out of the group",
    async () => {
      await withGroups(
        [grouped('u1', 'one'), grouped('a1', 'A1', 'g-1'), grouped('a2', 'A2', 'g-1')],
        [PR1()],
        async () => {
          await show('rules');
          await app
            .locator('[data-testid="group"][data-group="PR-1"]')
            .waitFor({ timeout: 3000 });
          const row = (name) => app.locator('[data-testid="rule"]', { hasText: name });
          // Each mark: what has it, which, and where a line starts, from the list's left edge.
          const marks = () =>
            app.evaluate(() => {
              const list = document
                .querySelector('[data-testid="rule-list"]')
                .getBoundingClientRect();
              return [
                ...document.querySelectorAll('[data-testid="rule-list"] [data-drop]'),
              ].map((element) => [
                element.dataset.testid,
                element.dataset.drop,
                Math.round(
                  element.getBoundingClientRect().left +
                    parseFloat(
                      getComputedStyle(element, `::${element.dataset.drop}`).left,
                    ) -
                    list.left,
                ),
              ]);
            });
          // Chromium fires this drag's dragover only now and then, where a pointer resting in
          // one place gets one every 50 ms or so: two small nudges make it fire where it stops.
          const moveTo = async ([x, y]) => {
            await app.mouse.move(x, y, { steps: 6 });
            for (const nudge of [1, 0]) {
              await sleep(80);
              await app.mouse.move(x + nudge, y);
            }
            await sleep(150);
            return marks();
          };
          const lowerEdge = async (locator) => {
            const box = await locator.boundingBox();
            return [box.x + 120, box.y + box.height - 5];
          };
          const upperEdge = async (locator) => {
            const box = await locator.boundingBox();
            return [box.x + 120, box.y + 5];
          };
          const label = await app.locator('[data-testid="rule-list"] h2').boundingBox();
          const entries = await app
            .locator('[data-testid="rule-list"] [data-entries]')
            .boundingBox();
          const from = await row('From one').boundingBox();
          await app.mouse.move(from.x + 60, from.y + from.height / 2);
          await app.mouse.down();
          await app.mouse.move(from.x + 64, from.y + from.height / 2 + 4, { steps: 3 });
          const seen = [
            await moveTo(await lowerEdge(row('From A2'))),
            await moveTo(await upperEdge(row('From A1'))),
            await moveTo([label.x + 10, label.y + label.height / 2]),
            await moveTo(await upperEdge(row('From A1'))),
            await moveTo([900, 420]),
            await moveTo([entries.x + 120, entries.y + entries.height + 30]),
          ];
          await app.mouse.up();
          await sleep(400);
          expect(
            [
              seen,
              (await storedRules()).map((rule) => [rule.id, rule.group ? 'PR-1' : '']),
              (await storedGroups())[0].at,
              await app.evaluate(
                () =>
                  document.querySelectorAll(
                    '[data-testid="rule-list"] [data-drop], [data-testid="rule-list"] .opacity-40',
                  ).length,
              ),
            ],
            [
              [
                [['rule', 'after', 32]],
                [['rule', 'before', 32]],
                [],
                [['rule', 'before', 32]],
                [],
                [['group-block', 'after', 6]],
              ],
              [
                ['a1', 'PR-1'],
                ['a2', 'PR-1'],
                ['u1', ''],
              ],
              0,
              0,
            ],
          );
        },
      );
    },
  );

  await check(
    'the open rule moved into a folded group, by Move to group or by a drag onto its header, unfolds it, so the rule stays in sight, picked (up to 0.25.0 it went out of sight); the group folded by hand with the open rule in it stays folded',
    async () => {
      await withGroups(
        [grouped('u1', 'one'), grouped('a1', 'A1', 'g-1')],
        [PR1()],
        async () => {
          await show('rules');
          const header = app.locator('[data-testid="group"][data-group="PR-1"]');
          await header.waitFor({ timeout: 3000 });
          const name = header.locator('[data-testid="group-name"]');
          // Whether the group is open, and which rule the list shows picked.
          const seen = async () => [
            await name.getAttribute('aria-expanded'),
            await app.evaluate(
              () =>
                document.querySelector(
                  '[data-testid="rule-list"] [data-testid="rule"][data-selected] [data-slot="item-title"]',
                )?.textContent ?? null,
            ),
          ];
          await app.locator('[data-testid="rule"]', { hasText: 'From one' }).click();
          await name.click();
          const folded = await seen();
          await app.click('[data-testid="rule-menu"]');
          await app.click('[data-testid="move-to-group"]');
          await app.click('[data-testid="move-to"][data-group="PR-1"]');
          await sleep(300);
          const moved = await seen();
          await name.click();
          await sleep(200);
          const byHand = await seen();
          await app.click('[data-testid="rule-menu"]');
          await app.click('[data-testid="move-to-group"]');
          await app.click('[data-testid="move-to-none"]');
          await sleep(300);
          const box = await header.boundingBox();
          await app
            .locator('[data-testid="rule"]', { hasText: 'From one' })
            .dragTo(header, { targetPosition: { x: 140, y: box.height - 5 } });
          await sleep(300);
          expect(
            [folded, moved, byHand, await seen()],
            [
              ['false', 'From one'],
              ['true', 'From one'],
              ['false', null],
              ['true', 'From one'],
            ],
          );
        },
      );
    },
  );

  await check(
    "the popup's All rules lists a group in its place with its dot, which turns it off and on, saved at once, and its rules set in under it; its name folds it, as the editor's list then does; This page names a rule's group",
    async () => {
      // The group on top, so its rule is the one that answers on the page.
      await withGroups(
        [grouped('a1', 'A1', 'g-1'), grouped('u1', 'one')],
        [PR1({ at: 0 })],
        async () => {
          await popup.reload();
          const group = popup.locator('[data-testid="popup-group"][data-group="PR-1"]');
          await group.waitFor({ timeout: 3000 });
          const rows = () =>
            popup.evaluate(() =>
              [
                ...document.querySelectorAll(
                  '[data-testid="popup-rule"], [data-testid="popup-group"]',
                ),
              ].map((row) =>
                row.dataset.testid === 'popup-group'
                  ? `group ${row.dataset.group}`
                  : row.querySelector('[data-slot="item-title"]').textContent,
              ),
            );
          const shown = await rows();
          await group.locator('[role="switch"]').click();
          await sleep(200);
          const off = (await storedGroups())[0].enabled;
          await group.locator('[role="switch"]').click();
          await sleep(200);
          const on = (await storedGroups())[0].enabled;
          await group.locator('[data-testid="popup-group-name"]').click();
          const folded = await rows();
          await show('rules');
          await app
            .locator('[data-testid="rule"]', { hasText: 'From A1' })
            .waitFor({ state: 'detached', timeout: 3000 });
          await group.locator('[data-testid="popup-group-name"]').click();
          await app
            .locator('[data-testid="rule"]', { hasText: 'From A1' })
            .waitFor({ timeout: 3000 });
          // This page, beside the page, where PR-1's rule just answered.
          await call('/api/user?case=grouped');
          await sleep(300);
          await page.bringToFront();
          const opened = context.waitForEvent('page', {
            predicate: (candidate) => candidate.url().includes('popup.html'),
          });
          await worker.evaluate(() =>
            chrome.tabs.create({ url: 'popup.html', active: false }),
          );
          const here = await opened;
          let named;
          try {
            await here.waitForSelector('[data-testid="rule-group"]', { timeout: 5000 });
            named = await here
              .locator('[data-testid="rule-group"]')
              .first()
              .textContent();
          } finally {
            await here.close();
            await popup.bringToFront();
          }
          expect(
            [shown, off, on, folded, named],
            [
              ['group PR-1', 'From A1', 'From one'],
              false,
              true,
              ['group PR-1', 'From one'],
              'PR-1',
            ],
          );
        },
      );
    },
  );

  await check(
    "Export group saves the group and its rules; imported, the group comes in at the top, turned off, its rules' switches as they were, a name that's taken given a number",
    async () => {
      await withGroups(
        [
          grouped('u1', 'one'),
          grouped('a1', 'A1', 'g-1'),
          grouped('a2', 'A2', 'g-1', { enabled: false }),
        ],
        [PR1()],
        async () => {
          await show('rules');
          await app.click(
            '[data-testid="group"][data-group="PR-1"] [data-testid="group-menu"]',
          );
          const [download] = await Promise.all([
            app.waitForEvent('download'),
            app.click('text=Export group'),
          ]);
          const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
          await app.setInputFiles('[data-testid="import-file"]', {
            name: 'pr-1.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(file)),
          });
          await sleep(500);
          const groups = await storedGroups();
          const imported = groups.find((group) => group.name === 'PR-1 (2)');
          expect(
            [
              [file.ghostfetch, file.groups.map((group) => group.name)],
              file.rules.map((rule) => rule.name),
              groups.map((group) => [group.name, group.at, group.enabled]),
              (await storedRules())
                .filter((rule) => rule.group === imported?.id)
                .map((rule) => [rule.name, rule.enabled]),
            ],
            [
              [2, ['PR-1']],
              ['From A1', 'From A2'],
              [
                ['PR-1 (2)', 0, false],
                ['PR-1', 2, true],
              ],
              [
                ['From A1', true],
                ['From A2', false],
              ],
            ],
          );
        },
      );
    },
  );

  await check('no uncaught errors in pages or the extension', async () => {
    if (errors.length) throw new Error(errors.join('\n'));
  });
} finally {
  await context.close();
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

finish();
