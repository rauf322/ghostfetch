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
    'merge: deep-merges objects, replaces arrays, keeps real headers',
    async () => {
      const r = await call('/api/user?case=merge');
      expect(r.body, {
        id: 1,
        name: 'Real',
        role: 'admin',
        profile: { city: 'Berlin', age: 30 },
        tags: ['z'],
      });
      expect(r.headers['x-real'], 'yes', 'real header');
    },
  );
  await check('script: transforms the real response', async () => {
    const r = await call('/api/user?case=script');
    expect([r.body.name, r.body.sawUrl], ['REAL', true]);
  });
  await check('broken merge JSON falls back to the real response', async () => {
    const r = await call('/api/user?case=badmerge');
    expect([r.status, r.body.name], [200, 'Real']);
  });
  await check('original + delay + status override', async () => {
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
  await check('merge with responseType "json"', async () => {
    const r = await xhr('/api/user?case=merge', { responseType: 'json' });
    expect(
      [r.status, r.response.role, r.response.profile],
      [200, 'admin', { city: 'Berlin', age: 30 }],
    );
  });
  await check('POST body reaches the real server through a modifying rule', async () => {
    const r = await xhr('/api/user?case=script', { method: 'POST', body: 'hello' });
    expect(r.response && JSON.parse(r.response).name, 'REAL');
  });
  await check('unmatched XHR goes to the network untouched', async () => {
    const r = await xhr('/api/user?case=none', { responseType: 'json' });
    expect(
      [r.status, r.response.name, r.url],
      [200, 'Real', `${ORIGIN}/api/user?case=none`],
    );
  });

  console.log('declarativeNetRequest rules');
  await check('redirect', async () => {
    const r = await call('/api/old-home');
    expect([r.body, r.url], [{ redirected: true }, `${ORIGIN}/api/new-home`]);
  });
  await check('request and response headers', async () => {
    const r = await call('/api/echo');
    expect([r.body.headers['x-debug'], r.headers['x-resp']], ['1', 'ok']);
  });
  await check('block', async () => {
    const r = await call('/api/blocked');
    if (!r.error) throw new Error(`request was not blocked: ${JSON.stringify(r)}`);
  });

  console.log('switches');
  await check('master switch off disables every rule', async () => {
    await setStorage({ enabled: false });
    await sleep(400);
    expect((await call('/api/user?case=replace')).body.name, 'Real');
    expect((await call('/api/old-home')).status, 404);
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

  await check('rule list renders every rule', async () => {
    expect(await app.locator('[data-testid="rule"]').count(), RULES.length);
  });
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await app.locator('[data-testid="rule"]').nth(2).click();
    await app.screenshot({ path: `${SHOTS}/wide-rules.png` });
  }

  await check('create a rule in the editor and it mocks immediately', async () => {
    await app.click('[data-testid="new-rule"]');
    await app.click('[data-testid="new-response"]');
    await app.fill('[data-testid="match-url"]', 'case=ui');
    await app.fill('[data-testid="rule-name"]', 'Made in the UI');
    const editor = app.locator('.code textarea');
    await editor.fill('{"ui": true}');
    await app.click('[data-testid="tab-status"]');
    await app.click('[data-testid="status-201"]');
    await app.click('[data-testid="tab-body"]');
    await sleep(600);
    const r = await call('/api/user?case=ui');
    expect([r.status, r.body], [201, { ui: true }]);
    expect(await app.locator('[data-testid="code-status"]').textContent(), 'Valid JSON');
  });
  await check('tester and invalid JSON feedback', async () => {
    await app.fill('[data-testid="tester"]', `${ORIGIN}/api/user?case=ui`);
    expect(await app.locator('[data-testid="tester-result"]').textContent(), 'Matches');
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
    'the response tabs: status, delay and headers, each with its value on its tab',
    async () => {
      const tab = (name) => app.locator(`[data-testid="tab-${name}"]`).textContent();
      // Where Match requests is in the pane's content, wherever the pane is scrolled to (a click
      // scrolls what it clicks into view).
      const matchTop = () =>
        app.locator('[data-testid="match-url"]').evaluate((field) => {
          const pane = field.closest('[data-slot="pane-scroll"]');
          return Math.round(
            field.getBoundingClientRect().top -
              pane.getBoundingClientRect().top +
              pane.scrollTop,
          );
        });
      const top = await matchTop();
      expect(await tab('status'), 'Status201');
      await app.click('[data-testid="tab-status"]');
      expect(await app.locator('[data-testid="status-name"]').textContent(), 'Created');
      await app.fill('[data-testid="status-code"]', '418');
      expect(
        await app.locator('[data-testid="status-name"]').textContent(),
        "I'm a Teapot",
      );
      await app.click('[data-testid="status-404"]');
      expect(
        [await tab('status'), await app.inputValue('[data-testid="status-code"]')],
        ['Status404', '404'],
      );
      await app.click('[data-testid="tab-delay"]');
      // The tab left behind goes a frame later.
      await sleep(100);
      expect(await matchTop(), top, 'Match requests stays put');
      expect(
        await app
          .locator('.code')
          .evaluate((code) => code.closest('[role="tabpanel"]').inert),
        true,
        'the Body tab is inert behind the others',
      );
      await app.click('[data-testid="delay-1000"]');
      expect(await tab('delay'), 'Delay1 s');
      // The chosen one again goes back to none.
      await app.click('[data-testid="delay-1000"]');
      expect(await tab('delay'), 'Delay');
      await app.fill('[data-testid="delay"]', '600');
      await app.click('[data-testid="tab-headers"]');
      await sleep(100);
      expect(await matchTop(), top, 'Match requests stays put');
      await app.getByRole('button', { name: 'Add header' }).click();
      await app.keyboard.type('X-Tabbed');
      expect(await tab('headers'), 'Headers1');
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
      await app.click('[data-testid="tab-delay"]');
      await app.click('[data-testid="delay-0"]');
      await app.click('[data-testid="tab-status"]');
      await app.click('[data-testid="status-201"]');
      await app.click('[data-testid="tab-body"]');
    },
  );
  await check(
    'a JSON mistake is marked where it is, and clicking it puts the cursor there',
    async () => {
      await app.click('[data-testid="tab-body"]');
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
            '[data-testid="tab-body"]',
          ].map((selector) => document.querySelector(selector).textContent.trim()),
        ),
        [
          '42',
          'missing comma',
          '2',
          'Line 2: missing comma after 42',
          'Body✗, has a mistake',
        ],
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
    'text size: − and + step it, the number puts it back, remembered',
    async () => {
      await app.click('[data-testid="tab-body"]');
      const size = () =>
        app.evaluate(() => [
          getComputedStyle(document.querySelector('.code')).fontSize,
          document.querySelector('[data-testid="font-size"]').textContent,
          localStorage.getItem('ghostfetch.fontSize'),
        ]);
      expect(await size(), ['11.5px', '11.5', null]);
      await app.click('[data-testid="font-larger"]');
      await app.click('[data-testid="font-larger"]');
      expect(await size(), ['13px', '13', '13']);
      // Back at the default, nothing is kept.
      await app.click('[data-testid="font-size"]');
      expect(await size(), ['11.5px', '11.5', null]);
    },
  );
  await check(
    'the body editor is as tall as its text, up to where the section fits the pane',
    async () => {
      await app.click('[data-testid="tab-body"]');
      const editor = app.locator('.code textarea');
      const heights = () =>
        app.evaluate(() => {
          const code = document.querySelector('.code');
          return {
            code: code.offsetHeight,
            section: code.closest('[data-slot="tabs"]').offsetHeight,
            pane: code.closest('[data-slot="pane-scroll"]').clientHeight,
          };
        });
      await editor.fill('{"short": true}');
      expect((await heights()).code, 120, 'a short body: the smallest editor');
      await editor.fill(
        '{\n  "a": 1,\n  "b": 2,\n  "c": 3,\n  "d": 4,\n  "e": 5,\n  "f": 6\n}',
      );
      // Eight lines of 20.125 px (11.5 px text, line height 1.75), its padding and border.
      expect((await heights()).code, 179, 'eight lines: eight lines tall');
      await editor.fill(
        JSON.stringify(
          { items: Array.from({ length: 200 }, (_, id) => ({ id })) },
          null,
          2,
        ),
      );
      const tall = await heights();
      if (Math.abs(tall.section - tall.pane) > 1)
        throw new Error(`a long body: section ${tall.section}px, pane ${tall.pane}px`);
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
      const url = app.locator('[data-testid="match-url"]');
      await url.click();
      await url.press('End');
      await app.keyboard.type('X');
      await body.focus();
      await typeVim('u');
      expect(
        [await url.inputValue(), (await vimState()).message, await bodyFocused()],
        ['case=uiX', 'Already at oldest change', true],
      );
      await url.fill('case=ui');
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
      await app.mouse.move(box.x + 30, box.y + 30);
      await app.mouse.down();
      await app.mouse.move(box.x + 120, box.y + 30, { steps: 4 });
      await app.mouse.up();
      const selected = await vimState();
      expect(selected.mode, 'Visual');
      if (!/^\d+ chars?$/.test(selected.message))
        throw new Error(`selection size: ${selected.message}`);
      await app.mouse.click(box.x + 30, box.y + 50);
      expect((await vimState()).mode, 'Normal');
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
  await check("invalid redirect shows Chrome's error on the rule", async () => {
    await app.click('[data-testid="new-rule"]');
    await app.click('[data-testid="new-redirect"]');
    await app.fill('[data-testid="match-url"]', '/never');
    await app.fill('[data-testid="redirect-to"]', '/relative/path');
    await app.waitForSelector('[data-testid="dnr-error"]', { timeout: 3000 });
    await app.click('[data-testid="rule-menu"]');
    await app.click('[data-testid="delete-rule"]');
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
    for (const label of ['Mocked', 'Modified', 'Rule error', 'Redirected', 'Blocked']) {
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
    expect(
      await app.inputValue('[data-testid="match-url"]'),
      '/api/user?case=live-check',
    );
    expect(JSON.parse(await body.inputValue()).name, 'Real');
    await body.fill('{"fromTraffic": true}');
    await sleep(500);
    expect((await call('/api/user?case=live-check')).body, { fromTraffic: true });
  });
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
    await app.click('[data-testid="tab-status"]');
    await app.screenshot({ path: `${SHOTS}/narrow-status.png` });
    await app.click('[data-testid="tab-body"]');
    // A body with a mistake, marked, its message on hover; then the body as it was.
    const before = await body.inputValue();
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
  await check('imported rule files are validated and arrive turned off', async () => {
    const evil = {
      rules: [
        {
          name: 'Imported <img data-xss=1>',
          type: 'toString',
          match: { url: '/imported', method: '<img data-xss=1>', mode: 'constructor' },
          response: {
            delay: '"><img data-xss=1>',
            status: '<b>',
            headers: [{ op: 'set', name: 1, value: {} }],
          },
        },
      ],
    };
    await app.setInputFiles('[data-testid="import-file"]', {
      name: 'evil.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(evil)),
    });
    await app.waitForSelector(
      '[data-testid="view-rules"]:not([hidden]) [data-testid="match-url"]',
    );
    expect(await app.locator('[data-xss]').count(), 0, 'injected elements');
    const { rules } = await worker.evaluate(() => chrome.storage.local.get('rules'));
    const imported = rules.find((r) => r.match.url === '/imported');
    const headers = imported.response.headers.map((row) => [row.op, row.name, row.value]);
    expect(
      [
        imported.enabled,
        imported.type,
        imported.match.method,
        imported.match.mode,
        imported.response.delay,
        imported.response.status,
        headers,
      ],
      [false, 'response', 'ANY', 'contains', 0, '', [['set', '', '']]],
    );
  });

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
  await check('local.* hosts get mocks and, once opened, header rules too', async () => {
    const probe = await context.newPage();
    await probe.goto(`${LOCAL_ORIGIN}/`);
    expect(
      await probe.evaluate(() => window.early),
      { early: 'mocked' },
      'mocked during load',
    );
    // The first visit makes the background remember the host for redirect, header and block rules.
    await sleep(600);
    const r = await probe.evaluate(async () => {
      const response = await fetch('/api/echo');
      return {
        sent: (await response.json()).headers['x-debug'],
        received: response.headers.get('x-resp'),
      };
    });
    await probe.close();
    expect([r.sent, r.received], ['1', 'ok']);
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
      redirect: await fetch('/api/old-home').then((x) => x.status),
      stolen: window.stolen,
    }));
    expect([r.wrapped, r.mock.name, r.redirect, r.stolen], [false, 'Real', 404, []]);
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
    'a rule edited in another view shows in the open editor, but not over what you are typing in the body',
    async () => {
      await app
        .locator('[data-testid="rule"]', { hasText: 'case=merge' })
        .first()
        .click();
      await app.evaluate(() => document.activeElement?.blur());
      const original = await storedRules();
      const elsewhere = structuredClone(original);
      const index = elsewhere.findIndex((r) => r.match.url === 'case=merge');
      elsewhere[index].response.merge = '{"from": "elsewhere"}';
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
      elsewhere[index].response.merge = '{"from": "elsewhere again"}';
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
      await app.click('[data-testid="tab-headers"]');
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
    await app.waitForFunction(
      () => document.querySelector('[data-testid="match-url"]')?.value === 'case=delay',
      null,
      { timeout: 3000 },
    );
  });
  await check(
    "a rule's switch in the list turns it off and on, and doesn't open it",
    async () => {
      const row = app.locator('[data-testid="rule"]', { hasText: 'case=merge' }).first();
      const state = async () => [
        (await storedRules()).find((r) => r.match.url === 'case=merge').enabled,
        await app.inputValue('[data-testid="match-url"]'),
      ];
      await row.getByRole('switch').click();
      await sleep(400);
      const off = await state();
      await row.getByRole('switch').click();
      await sleep(400);
      // The editor still shows the rule opened in the check before.
      expect(
        [off, await state()],
        [
          [false, 'case=delay'],
          [true, 'case=delay'],
        ],
      );
    },
  );
  await check(
    'Traffic: Matched hides what no rule matched, Preserve keeps the log over a reload, Clear empties it',
    async () => {
      await app.click('[data-testid="tab-traffic"]');
      await app.click('[data-testid="traffic-tab"]');
      await app
        .getByRole('option', { name: `Test app on ${new URL(ORIGIN).host}`, exact: true })
        .click();
      await page.reload();
      await page.evaluate(() => window.early);
      await page.evaluate(() => fetch('/api/user?case=none'));
      await app.waitForSelector('[data-testid="request"]:has-text("case=none")', {
        timeout: 3000,
      });
      const count = () => app.locator('[data-testid="request"]').count();
      const all = await count();
      await app.getByRole('button', { name: 'Matched' }).click();
      expect(
        [
          await count(),
          await app.locator('[data-testid="request"]', { hasText: 'case=none' }).count(),
        ],
        [all - 1, 0],
        'Matched',
      );
      await app.getByRole('button', { name: 'Matched' }).click();
      await app.getByRole('button', { name: 'Preserve' }).click();
      await page.reload();
      await page.evaluate(() => window.early);
      await app.waitForFunction(
        (before) => document.querySelectorAll('[data-testid="request"]').length > before,
        all,
        { timeout: 3000 },
      );
      await app.getByRole('button', { name: 'Preserve' }).click();
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
        .getByRole('button', { name: 'Preserve' })
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
