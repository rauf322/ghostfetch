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
import {
  CHROME_BUILD,
  VIM_START,
  VIM_STEPS,
  check,
  expect,
  finish,
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
  'added sites are reduced to plain hostnames, without duplicates or built-in hosts',
  async () => {
    expect(
      normalizeSites([
        'https://Staging.Example.com:8080/app?x=1',
        '*.example.com',
        'staging.example.com',
        'localhost:3000',
        '127.0.0.1',
        'local.myapp.com',
        '<img src=x>',
        '[::1]',
        'javascript:alert(1)',
        '',
      ]),
      ['staging.example.com', 'example.com'],
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
    // A non-localhost and a local.* hostname that still reach the test server.
    '--host-resolver-rules=MAP evil.test 127.0.0.1,MAP local.ghostfetch.test 127.0.0.1',
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
    expect(await app.locator('[data-testid="code-status"]').textContent(), 'Valid JSON');
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
        [0, 'Valid JSON'],
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
  await check(
    'a long body is coloured where it is on screen, and only there',
    async () => {
      const editor = app.locator('.code textarea');
      const before = await editor.inputValue();
      // The pieces on the highlight layer, and the coloured tokens in them.
      const painted = () =>
        app.evaluate(() => {
          const layer = document.querySelector('.code-highlight');
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
              const pieces = document.querySelectorAll('.code-highlight > span');
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
    'vim: G, gg and 50% scroll a long body with the cursor in view',
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
      await typeVim('gg');
      expect(
        [await body.evaluate((textarea) => textarea.scrollTop), await inView()],
        [0, true],
        'gg',
      );
      await typeVim('50%');
      expect(await inView(), true, '50%');
    },
  );
  await check('vim: Format still works in Normal mode', async () => {
    await setBody('{"a":1,"b":[1,2]}');
    await app.click('[data-testid="format"]');
    expect(await body.inputValue(), '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });
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

  await check('delete with undo', async () => {
    const before = await app.locator('[data-testid="rule"]').count();
    await app.click('[data-testid="rule-menu"]');
    await app.click('[data-testid="delete-rule"]');
    expect(await app.locator('[data-testid="rule"]').count(), before - 1);
    await app.click('[data-slot="toast"] button');
    expect(await app.locator('[data-testid="rule"]').count(), before);
  });
  await check('traffic view shows captured requests live', async () => {
    await app.click('[data-testid="tab-traffic"]');
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
  if (SHOTS) {
    await app
      .locator('[data-testid="request"]', { hasText: 'case=merge' })
      .first()
      .click();
    await app.screenshot({ path: `${SHOTS}/wide-traffic.png` });
  }
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
    'wide: the sidebar button and Cmd/Ctrl+B hide the list beside a rule, and beside a request in Traffic; it stays hidden after a reload; a narrow panel has no button',
    async () => {
      const key = `${process.platform === 'darwin' ? 'Meta' : 'Control'}+b`;
      // The list of a view: its width, and whether it's drawn (it stays laid out while hidden).
      const list = (view) =>
        app.evaluate((name) => {
          const aside = document.querySelector(`[data-testid="view-${name}"] aside`);
          return {
            width: Math.round(aside.getBoundingClientRect().width),
            shown: getComputedStyle(aside).visibility === 'visible',
          };
        }, view);
      const settled = (view, shown) =>
        app.waitForFunction(
          ([name, visible]) => {
            const aside = document.querySelector(`[data-testid="view-${name}"] aside`);
            const width = aside.getBoundingClientRect().width;
            return visible
              ? getComputedStyle(aside).visibility === 'visible' && width > 300
              : getComputedStyle(aside).visibility === 'hidden' && width < 2;
          },
          [view, shown],
          { timeout: 3000 },
        );
      const toggle = app.locator('[data-testid="sidebar-toggle"]:visible');
      const seen = [];
      await app.click('[data-testid="tab-rules"]');
      await app.locator('[data-testid="rule"]').first().click();
      seen.push((await list('rules')).shown);
      await toggle.click();
      await settled('rules', false);
      seen.push(await toggle.getAttribute('aria-expanded'));
      // The rule has the whole window.
      const pane = await app
        .locator('[data-testid="view-rules"] > div > section')
        .boundingBox();
      seen.push(pane.width > 1270);
      // Remembered: a reload opens with the list hidden, beside New rule, which has the button too.
      await app.reload();
      await app.waitForSelector('[data-testid="composer-input"]');
      await settled('rules', false);
      await app.keyboard.press(key);
      await settled('rules', true);
      seen.push((await list('rules')).shown);
      expect(seen, [true, 'false', true, true]);

      // Traffic: the list only gives way to an open request, and is back when it's closed.
      await toggle.click();
      await app.click('[data-testid="tab-traffic"]');
      await app.locator('[data-testid="request"]').first().waitFor({ timeout: 5000 });
      expect(
        await list('traffic'),
        { width: 1280, shown: true },
        'nothing open: the list',
      );
      await app.locator('[data-testid="request"]').first().click();
      await settled('traffic', false);
      // The drawer is a column in the middle of the window.
      const drawer = await app.locator('[data-testid="request-detail"]').boundingBox();
      if (Math.abs(drawer.width - 880) > 1 || Math.abs(drawer.x + 440 - 640) > 1)
        throw new Error(`the drawer with the list hidden: ${JSON.stringify(drawer)}`);
      await app.click('[data-testid="request-back"]');
      await settled('traffic', true);
      await app.locator('[data-testid="request"]').first().click();
      await settled('traffic', false);
      await app.keyboard.press(key);
      await settled('traffic', true);
      await app.click('[data-testid="request-back"]');

      // A narrow panel shows the list or what's open anyway: no button, and the key does nothing.
      await app.click('[data-testid="tab-rules"]');
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
    "wide: dragging the list's edge sizes it (at least 260 px, leaving 320), past half of that hides it and out again shows it; each tab keeps its width, after a reload too; the keys move it; a double-click gives the usual width back",
    async () => {
      const handle = (view) =>
        app.locator(`[data-testid="view-${view}"] [data-testid="sidebar-handle"]`);
      // The list's width once its column has stopped sliding: 0 while it's hidden (its column is
      // shut, though the list's own border is still 1 px wide, and it only goes invisible once the
      // column has slid shut).
      const width = async (view) => {
        let last;
        for (let tries = 0; tries < 40; tries++) {
          const now = await app.evaluate((name) => {
            const aside = document.querySelector(`[data-testid="view-${name}"] aside`);
            const shown = Math.round(aside.getBoundingClientRect().width);
            return getComputedStyle(aside).visibility === 'visible' && shown > 1
              ? shown
              : 0;
          }, view);
          if (now === last) return now;
          last = now;
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        return last;
      };
      const saved = (view) =>
        app.evaluate(
          (name) => localStorage.getItem(`ghostfetch.sidebar-width.${name}`),
          view,
        );
      // Takes the edge by its middle and lets go of it at `x` (whole pixels).
      const drag = async (view, x, { release = true } = {}) => {
        const box = await handle(view).boundingBox();
        const y = Math.round(box.y + box.height / 2);
        await app.mouse.move(Math.round(box.x + box.width / 2), y);
        await app.mouse.down();
        await app.mouse.move(x, y, { steps: 8 });
        if (release) await app.mouse.up();
      };
      const seen = [];
      await app.click('[data-testid="tab-rules"]');
      await app.locator('[data-testid="rule"]').first().click();
      // The usual width: a third of the window, at least 300 px.
      seen.push(await width('rules'));
      // While it's dragged, the columns follow the pointer instead of sliding.
      await drag('rules', 360, { release: false });
      seen.push(await app.locator('[data-view="rules"][data-resizing]').count());
      await app.mouse.up();
      seen.push(await width('rules'), await saved('rules'));
      await drag('rules', 150);
      seen.push(await width('rules'));
      await drag('rules', 1200);
      seen.push(await width('rules'));
      // Past half the narrowest: hidden, and the width from before this drag is kept for later.
      await drag('rules', 60);
      seen.push(
        await width('rules'),
        await app
          .locator('[data-testid="sidebar-toggle"]:visible')
          .getAttribute('aria-expanded'),
        await saved('rules'),
      );
      // The edge waits at the left; taken there (4 px into it), it brings the list back.
      await drag('rules', 500);
      seen.push(await width('rules'));
      expect(seen, [435, 1, 360, '360', 260, 960, 0, 'false', '960', 496]);

      // Traffic's list has its own width: what the drawer leaves (44%, at most 600 px).
      await app.click('[data-testid="tab-traffic"]');
      await app.locator('[data-testid="request"]').first().click();
      const traffic = [await width('traffic')];
      await drag('traffic', 500);
      traffic.push(await width('traffic'));
      // Remembered after a reload, each its own.
      await app.reload();
      await app.locator('[data-testid="request"]').first().click();
      traffic.push(await width('traffic'));
      await app.click('[data-testid="tab-rules"]');
      traffic.push(await width('rules'));
      expect(traffic, [717, 500, 500, 496]);

      // The keys, with the edge focused, and what it says it is.
      await app.click('[data-testid="tab-traffic"]');
      await handle('traffic').focus();
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
        const now = await width('traffic');
        keyed.push([key, now, await handle('traffic').getAttribute('aria-valuenow')]);
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
      await handle('traffic').dblclick();
      await app.click('[data-testid="request-back"]');
      await app.click('[data-testid="tab-rules"]');
      await handle('rules').dblclick();
      expect(
        [await width('rules'), await saved('rules'), await saved('traffic')],
        [435, null, null],
      );
      // A narrow panel has no edge to drag.
      await app.setViewportSize({ width: 400, height: 760 });
      expect(await app.locator('[data-testid="sidebar-handle"]:visible').count(), 0);
      await app.setViewportSize({ width: 1280, height: 820 });
    },
  );
  await check('traffic reconnects after the page reloads', async () => {
    await app.click('[data-testid="tab-traffic"]');
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
    await app.click('[data-testid="tab-rules"]');
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
    await app.click('[data-testid="tab-traffic"]');
    await app.screenshot({ path: `${SHOTS}/narrow-traffic.png` });
    await app.emulateMedia({ colorScheme: 'dark' });
    await app.click('[data-testid="tab-rules"]');
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
        await app.click('[data-testid="editor-menu"]');
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
      await app.click('[data-testid="tab-traffic"]');
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
      await app.click('[data-testid="tab-traffic"]');
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

  console.log('editor details');
  const storedRules = async () =>
    (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules;
  await app.click('[data-testid="tab-rules"]');
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
      await app.click('[data-testid="tab-traffic"]');
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
      await app.waitForSelector('[data-testid="tab-traffic"][aria-selected="true"]');
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

  await check('no uncaught errors in pages or the extension', async () => {
    if (errors.length) throw new Error(errors.join('\n'));
  });
} finally {
  await context.close();
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

finish();
