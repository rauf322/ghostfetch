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
import {
  isSiteEnabled,
  normalizeSites,
  siteMatchPatterns,
} from '../src/shared/api/index.ts';
import { diffLines, formatJson } from '../src/shared/lib/index.ts';
import {
  CHROME_BUILD,
  VIM_START,
  VIM_STEPS,
  check,
  expect,
  finish,
  itemsBody,
  requireBuild,
  sleep,
  startServer,
  testRules,
  vimKeys,
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

  console.log('switches');
  await check('master switch off disables every rule', async () => {
    await setStorage({ enabled: false });
    await sleep(400);
    expect((await call('/api/user?case=replace')).body.name, 'Real');
    await setStorage({ enabled: true });
    await sleep(400);
    expect((await call('/api/user?case=replace')).body, { name: 'Mocked' });
  });
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
      await app.getByTitle('Remove header').last().click();
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
      // (store.ts), and would bring the body back as it was.
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
    'vim: after a Format too long to undo, u undoes the changes since, back to the formatted body (x, then P, which puts it back as it was) and no further',
    async () => {
      const before = await body.inputValue();
      await setBody(ITEMS);
      await app.click('[data-testid="format"]');
      const long = await body.inputValue();
      await body.focus();
      await typeVim('/item 40<CR>x');
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
  const draws = async (action) => {
    await editorSession.send('Profiler.enable');
    await editorSession.send('Profiler.startPreciseCoverage', {
      callCount: true,
      detailed: false,
    });
    await editorSession.send('Profiler.takePreciseCoverage');
    await action();
    const { result } = await editorSession.send('Profiler.takePreciseCoverage');
    await editorSession.send('Profiler.stopPreciseCoverage');
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
      await app.locator('[data-testid="rule"][title="/api/early"]').click();
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
  await check('popup lists rules and toggles them', async () => {
    await popup.waitForSelector('[data-testid="popup-rule"]');
    const first = popup.locator('[data-testid="popup-rule"]').first();
    await first.locator('[role="switch"]').click();
    await sleep(200);
    const rules = (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules;
    expect(rules[0].enabled, false);
    await first.locator('[role="switch"]').click();
  });
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
  await check('the popup lists the sites you added and removes one with ×', async () => {
    // A new popup, which lists the site added in the check before.
    const sitesPopup = await context.newPage();
    sitesPopup.on('pageerror', (error) => errors.push(`popup: ${error.message}`));
    sitesPopup.on(
      'console',
      (message) =>
        message.type() === 'error' && errors.push(`popup console: ${message.text()}`),
    );
    await sitesPopup.goto(`chrome-extension://${extensionId}/popup.html`);
    await sitesPopup.waitForSelector('[data-testid="site-chip"]');
    expect(await sitesPopup.locator('[data-testid="site-chip"]').allTextContents(), [
      'evil.test×',
    ]);
    await sitesPopup.click('[data-testid="site-chip"]:has-text("evil.test") button');
    await sitesPopup.waitForFunction(
      () => !document.querySelector('[data-testid="site-chip"]'),
    );
    const { sites } = await worker.evaluate(() => chrome.storage.local.get('sites'));
    await sitesPopup.close();
    expect(sites, []);
  });
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
            row.title,
            row.hasAttribute('data-off'),
          ]),
        ]);
      const changed = structuredClone(original);
      changed[1].enabled = false;
      await setStorage({ rules: changed });
      await app.waitForFunction(
        (url) => document.querySelector(`[data-testid="rule"][title="${url}"][data-off]`),
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
      await app.click(`[data-testid="rule"][title="${rule.match.url}"]`);
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
      await app.getByTitle('Remove header').last().click();
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
    "a rule's switch in the list turns it off and on, doesn't open it, and pulses while it's on",
    async () => {
      const row = app.locator('[data-testid="rule"]', { hasText: 'case=merge' }).first();
      const dot = row.getByRole('switch');
      // Whether it's stored on, the rule the editor shows, and whether the dot pulses.
      const state = async () => [
        (await storedRules()).find((r) => r.match.url === 'case=merge').enabled,
        await app.getAttribute('[data-testid="rule-name"]', 'placeholder'),
        await dot.evaluate((element) =>
          element.firstElementChild
            .getAnimations()
            .some((animation) => animation.animationName === 'signal-pulse'),
        ),
      ];
      await dot.click();
      await sleep(400);
      const off = await state();
      await dot.click();
      await sleep(400);
      const on = await state();
      // While Ghostfetch is off, a rule that's on holds still, and its title says why.
      await setStorage({ enabled: false });
      await sleep(400);
      const paused = [...(await state()), await dot.getAttribute('title')];
      await setStorage({ enabled: true });
      await sleep(400);
      // The editor still shows the rule opened in the check before.
      expect(
        [off, on, paused],
        [
          [false, 'case=delay', false],
          [true, 'case=delay', true],
          [
            true,
            'case=delay',
            false,
            'On, but Ghostfetch is off. Click to turn this rule off',
          ],
        ],
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
      await app.getByTitle('Clear the log').click();
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
          document.querySelector('button[title="Clear the log"]').click();
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

  await check('no uncaught errors in pages or the extension', async () => {
    if (errors.length) throw new Error(errors.join('\n'));
  });
} finally {
  await context.close();
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

finish();
