// End-to-end test of Agent access (docs/agent-access.md), in Chromium: ghostfetch-mcp started as an
// agent starts it, with a real MCP client calling its tools, and Ghostfetch's editor paired with it
// through its own panel, doing what each tool asks on a real page of the test server. First, with
// no browser, which hosts are dev hosts, whose pages' requests the agent may see (isDevHost).
//
//   npm run test:agent      builds, then runs this (`npm install --prefix mcp` first, once)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDevHost } from '../src/agent-access/domain/dev-host.ts';
import {
  AGENT_READY,
  CHROME_BUILD,
  PAIRING_CODE,
  check,
  expect,
  finish,
  freePort,
  requireBuild,
  sleep,
  startAgent,
  startServer,
} from './fixtures.mjs';

const EXTENSION = requireBuild(CHROME_BUILD);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
if (!AGENT_READY) {
  console.error('ghostfetch-mcp has no packages yet: run npm install --prefix mcp');
  process.exit(1);
}

// Before anything starts: the hosts whose pages' requests the agent may see, and some that only
// look like them.
await check(
  'a dev host is localhost, a name under .localhost, 127.0.0.1 or a local. name, and not a lookalike, another site or an IPv6 address',
  async () => {
    const hosts = [
      'localhost',
      'app.localhost',
      '127.0.0.1',
      'local.myapp.com',
      'localhost.example.com',
      'local-app.test',
      'example.com',
      '[::1]',
    ];
    expect(
      hosts.map((host) => [host, isDevHost(host)]),
      [
        ['localhost', true],
        ['app.localhost', true],
        ['127.0.0.1', true],
        ['local.myapp.com', true],
        ['localhost.example.com', false],
        ['local-app.test', false],
        ['example.com', false],
        ['[::1]', false],
      ],
    );
  },
);

// ghostfetch-mcp on a port nothing listens on, with a token file of the test's own.
const PORT = await freePort();
const TOKEN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-agent-'));
const AGENT = { port: PORT, tokenFile: path.join(TOKEN_DIR, 'token') };
let agent = await startAgent(AGENT);
const tool = (name, args) => agent.tool(name, args);

const { server, ORIGIN, EVIL_ORIGIN } = await startServer();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-agent-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  ...(process.env.CHROME
    ? { executablePath: process.env.CHROME }
    : { channel: 'chromium' }),
  headless: !process.env.HEADED,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    // A site that isn't a dev host, which still reaches the test server.
    '--host-resolver-rules=MAP evil.test 127.0.0.1',
  ],
  viewport: { width: 1280, height: 820 },
});
const errors = [];

try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  const extensionId = new URL(worker.url()).host;
  for (
    let attempt = 0;
    attempt < 50 && !(await worker.evaluate(() => Boolean(globalThis.chrome?.storage)));
    attempt++
  )
    await sleep(100);
  await worker.evaluate(() =>
    chrome.storage.local.set({ enabled: true, record: true, rules: [] }),
  );
  await sleep(300);
  const stored = async () =>
    (await worker.evaluate(() => chrome.storage.local.get('rules'))).rules;

  // The dev app, and the editor in a tab beside it, which watches it (the web page used last).
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  await page.goto(`${ORIGIN}/`);
  const call = (url) =>
    page.evaluate(async (target) => {
      const response = await fetch(target);
      const text = await response.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON.
      }
      return { status: response.status, body };
    }, url);
  const openEditor = async () => {
    const editor = await context.newPage();
    editor.on('pageerror', (error) => errors.push(`editor: ${error.message}`));
    await editor.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await editor.waitForSelector('[data-testid="agent-button"]');
    return editor;
  };
  const app = await openEditor();
  // Until Agent access says `words` (its panel open in `editor`).
  const waitStatus = (words, editor = app) =>
    editor.waitForFunction(
      (want) =>
        document.querySelector('[data-testid="agent-status"]')?.textContent === want,
      words,
      { timeout: 10_000 },
    );
  // Until the footer's Agent button says `status` (off, waiting, connected, refused), panel or not.
  const waitButton = (status, editor = app) =>
    editor.waitForFunction(
      (want) =>
        document.querySelector('[data-testid="agent-button"]')?.dataset.status === want,
      status,
      { timeout: 10_000 },
    );

  let code = '';
  await check(
    "status with no editor connected says how to connect one, with ghostfetch-mcp's pairing code",
    async () => {
      const said = await tool('status');
      code = PAIRING_CODE.exec(said.text ?? '')?.[1] ?? '';
      const token = fs.readFileSync(path.join(TOKEN_DIR, 'token'), 'utf8').trim();
      expect(
        [
          said.text?.startsWith("Ghostfetch isn't connected."),
          code.split('-')[0],
          code.slice(code.indexOf('-') + 1).replaceAll('-', ''),
          (fs.statSync(path.join(TOKEN_DIR, 'token')).mode & 0o777).toString(8),
        ],
        [true, String(PORT), token, '600'],
      );
    },
  );

  await check(
    'Agent access turns on with the pairing code and connects; a wrong code is turned down; the code is remembered',
    async () => {
      await app.click('[data-testid="agent-button"]');
      await app.fill('[data-testid="agent-code"]', `${PORT}-AAAA-BBBB-CCCC-DDDD`);
      await app.click('[data-testid="agent-on"]');
      await waitStatus('Wrong code');
      const refused = await app.locator('[data-testid="agent-panel"] p').textContent();
      // Pasted as it might be: lower case, with spaces around.
      await app.fill('[data-testid="agent-code"]', `  ${code.toLowerCase()} `);
      await app.click('[data-testid="agent-on"]');
      await waitStatus('Connected');
      const said = await tool('status');
      expect(
        [
          refused.startsWith('ghostfetch-mcp turned that code down'),
          await app.getAttribute('[data-testid="agent-button"]', 'data-status'),
          await app.textContent('[data-testid="agent-words"]'),
          JSON.parse(await app.evaluate(() => localStorage.getItem('ghostfetch.agent'))),
          [said.connected, said.editor, said.page?.url, said.page?.devHost],
          [said.ghostfetch?.on, said.ghostfetch?.recording, said.rules, said.groups],
        ],
        [
          true,
          'connected',
          'ghostfetch-test is connected. Keep this editor open while it works.',
          { code, on: true },
          [true, 'a tab', `${ORIGIN}/`, true],
          [true, true, { total: 0, on: 0, answering: 0 }, { total: 0, on: 0 }],
        ],
      );
    },
  );

  await check(
    "the footer's Agent button fits beside ⋯, Import and Export, the sidebar at its narrowest too: named where there's room, its icon (with the dot) where there isn't",
    async () => {
      const handle = app.locator('[data-testid="sidebar-handle"]');
      // The footer once the sidebar is `width` wide: on screen and nothing past its end, Agent
      // named or not, and its dot.
      const footer = async (width) => {
        if (width !== undefined)
          await app.waitForFunction(
            (want) =>
              Math.round(
                document.querySelector('[data-testid="sidebar"]').getBoundingClientRect()
                  .width,
              ) === want,
            width,
          );
        return app.evaluate(() => {
          const row = document.querySelector('[data-testid="sidebar"] footer');
          const button = document.querySelector('[data-testid="agent-button"]');
          const name = [...button.querySelectorAll('span')].find(
            (span) => span.textContent === 'Agent',
          );
          return [
            row.checkVisibility() && row.scrollWidth <= row.clientWidth,
            name.checkVisibility() ? 'Agent' : 'icon',
            Boolean(button.querySelector('[data-slot="signal-dot"]')?.checkVisibility()),
          ];
        });
      };
      const seen = [];
      await handle.focus();
      await app.keyboard.press('Home');
      seen.push(await footer(260));
      await handle.dblclick();
      seen.push(await footer(272));
      await handle.focus();
      await app.keyboard.press('End');
      seen.push(await footer(960));
      await handle.dblclick();
      // A narrow panel, where ⋯ is in the top bar instead.
      for (const width of [280, 360]) {
        await app.setViewportSize({ width, height: 820 });
        await sleep(100);
        seen.push(await footer());
      }
      await app.setViewportSize({ width: 1280, height: 820 });
      expect(seen, [
        [true, 'icon', true],
        [true, 'icon', true],
        [true, 'Agent', true],
        [true, 'icon', true],
        [true, 'Agent', true],
      ]);
    },
  );

  let made = '';
  await check(
    "save_rule makes a rule that answers on the page at once, first in the editor's list, and the panel lists it",
    async () => {
      const saved = await tool('save_rule', {
        name: 'Agent made',
        match: { url: '/api/agent-made', method: 'GET' },
        response: { body: { from: 'agent', items: [1, 2] } },
      });
      made = saved.rule?.id;
      await app.waitForSelector('[data-testid="rule"][data-url="/api/agent-made"]');
      expect(
        [
          [saved.created, saved.position, saved.problems],
          saved.rule?.response.body,
          await call('/api/agent-made'),
          (await stored()).map((rule) => rule.name),
          // The newest of what the agent did, which opens the rule.
          await app
            .locator('[data-testid="agent-activity"] li button')
            .first()
            .textContent(),
        ],
        [
          [true, 0, []],
          '{\n  "from": "agent",\n  "items": [\n    1,\n    2\n  ]\n}',
          { status: 200, body: { from: 'agent', items: [1, 2] } },
          ['Agent made'],
          'Created “Agent made”',
        ],
      );
    },
  );

  let real = '';
  await check(
    'recent_requests lists what the page asked for and what each rule did, and get_request has the bodies',
    async () => {
      await call('/api/user?case=agent-real');
      await sleep(300);
      const unanswered = await tool('recent_requests', { url: 'case=agent-real' });
      const mocked = await tool('recent_requests', { action: 'mocked' });
      real = unanswered.requests?.[0]?.id;
      const full = await tool('get_request', { id: real });
      expect(
        [
          unanswered.page?.url,
          unanswered.requests?.map((request) => [
            request.method,
            request.status,
            request.rule,
          ]),
          mocked.requests?.map((request) => [
            new URL(request.url).pathname,
            request.rule?.name,
            request.rule?.did,
          ]),
          full.responseBody && JSON.parse(full.responseBody).name,
        ],
        [
          `${ORIGIN}/`,
          [['GET', 200, null]],
          [['/api/agent-made', 'Agent made', 'mocked']],
          'Real',
        ],
      );
    },
  );

  let mocked = '';
  await check(
    "mock_request makes a rule from a request, answering with the server's own response, which save_rule then changes",
    async () => {
      const fromRequest = await tool('mock_request', { id: real, name: 'Real user' });
      mocked = fromRequest.rule?.id;
      const first = await call('/api/user?case=agent-real');
      const changed = await tool('save_rule', {
        id: mocked,
        response: { body: { id: 1, name: 'Mocked by the agent' } },
      });
      const second = await call('/api/user?case=agent-real');
      expect(
        [
          [fromRequest.created, fromRequest.position, fromRequest.problems],
          [
            fromRequest.rule?.match.method,
            fromRequest.rule?.match.mode,
            fromRequest.rule?.match.url,
          ],
          first.body.name,
          [changed.created, changed.rule?.name, changed.rule?.match.url],
          second.body,
        ],
        [
          [true, 0, []],
          ['GET', 'equals', '/api/user?case=agent-real'],
          'Real',
          [false, 'Real user', '/api/user?case=agent-real'],
          { id: 1, name: 'Mocked by the agent' },
        ],
      );
    },
  );

  await check(
    'save_rule changes only what it is given: turned off, the rule leaves the page alone and its dot is grey; position moves it',
    async () => {
      const before = (await stored()).find((rule) => rule.id === made);
      await tool('save_rule', { id: made, enabled: false });
      const off = await call('/api/agent-made');
      const after = (await stored()).find((rule) => rule.id === made);
      await tool('save_rule', { id: made, position: 0 });
      const listed = await tool('list_rules');
      expect(
        [
          off.status,
          after.enabled,
          JSON.stringify([after.match, after.response]) ===
            JSON.stringify([before.match, before.response]),
          await app.getAttribute(
            '[data-testid="rule"][data-url="/api/agent-made"] [role="switch"]',
            'aria-checked',
          ),
          listed.rules?.map((rule) => [rule.position, rule.title, rule.enabled]),
        ],
        [
          404,
          false,
          true,
          'false',
          [
            [0, 'Agent made', false],
            [1, 'Real user', true],
          ],
        ],
      );
    },
  );

  await check(
    'try_url names the rule that would answer a request, and the others that match',
    async () => {
      // A path, which it takes as on the page the editor watches, and a whole URL.
      const answered = await tool('try_url', { url: '/api/user?case=agent-real' });
      const off = await tool('try_url', {
        url: `${ORIGIN}/api/agent-made`,
        method: 'GET',
      });
      expect(
        [
          answered.answeredBy?.title,
          off.answeredBy,
          off.alsoMatching?.map((rule) => [rule.title, rule.enabled]),
        ],
        ['Real user', null, [['Agent made', false]]],
      );
    },
  );

  await check(
    "save_rule says what's wrong with a rule: a regex that doesn't compile, a body that isn't JSON, a header the page won't get",
    async () => {
      const saved = await tool('save_rule', {
        name: 'Broken',
        match: { url: '(', mode: 'regex' },
        response: { body: '{"a": }', headers: [{ name: 'Set-Cookie', value: 'a=1' }] },
      });
      await tool('delete_rule', { id: saved.rule.id });
      expect(
        saved.problems?.map((problem) => problem.split(/[,:]/)[0]),
        [
          "Its regex doesn't compile",
          "Its body isn't valid JSON",
          'Its header row “Set-Cookie”',
        ],
      );
    },
  );

  await check(
    'delete_rule deletes a rule, which Undo in the editor brings back',
    async () => {
      const deleted = await tool('delete_rule', { id: mocked });
      await app.waitForSelector(
        '[data-testid="rule"][data-url="/api/user?case=agent-real"]',
        {
          state: 'detached',
        },
      );
      const gone = (await stored()).map((rule) => rule.name);
      await app.click('[data-slot="toast-action"]');
      await app.waitForSelector(
        '[data-testid="rule"][data-url="/api/user?case=agent-real"]',
      );
      expect(
        [deleted.deleted?.name, gone, (await stored()).map((rule) => rule.name)],
        ['Real user', ['Agent made'], ['Agent made', 'Real user']],
      );
    },
  );

  await check(
    "groups: save_rule with a group no group has makes it, at the top, the rule in it; list_rules, recent_requests and Traffic name it; save_group turns it off, and the page, try_url and the rule's report pass it by; save_group copies it into a new group where it's told, and renames one; delete_group deletes one with its rules, which Undo in the editor brings back",
    async () => {
      const saved = await tool('save_rule', {
        name: 'Grouped',
        group: 'feat/checkout',
        match: { url: '/api/agent-grouped' },
        response: { body: { grouped: true } },
      });
      const answered = await call('/api/agent-grouped');
      const listed = await tool('list_rules');
      const group = listed.groups?.find((each) => each.name === 'feat/checkout');
      const inList = listed.rules?.find((rule) => rule.id === saved.rule?.id);
      // Once the request has reached the editor's log, which Traffic lists.
      await app.click('[data-testid="nav-traffic"]');
      const row = app.locator('[data-testid="request"]', { hasText: 'agent-grouped' });
      await row.first().waitFor({ timeout: 3000 });
      const traffic = await row.first().textContent();
      await app.click('[data-testid="nav-rules"]');
      const requests = await tool('recent_requests', { url: '/api/agent-grouped' });

      const off = await tool('save_group', { name: 'feat/checkout', enabled: false });
      const passed = await call('/api/agent-grouped');
      const tried = await tool('try_url', { url: '/api/agent-grouped' });
      const report = await tool('get_rule', { id: saved.rule?.id });
      const copied = await tool('save_group', {
        name: 'feat/checkout-2',
        copyOf: 'feat/checkout',
        position: 1,
      });
      const renamed = await tool('save_group', { id: group?.id, name: 'PR-12' });
      const deleted = await tool('delete_group', { name: 'feat/checkout-2' });
      const gone = (await tool('list_rules')).groups.map((each) => each.name);
      await app.click(
        '[data-slot="toast"]:has-text("feat/checkout-2") [data-slot="toast-action"]',
      );
      await sleep(300);
      const back = (await tool('list_rules')).groups.map((each) => [
        each.name,
        each.position,
      ]);
      await tool('delete_group', { name: 'PR-12' });
      await tool('delete_group', { name: 'feat/checkout-2' });
      expect(
        [
          [saved.created, saved.group, saved.position],
          answered,
          [group?.position, group?.enabled, group?.rules],
          [inList?.group, inList?.answering],
          requests.requests?.[0]?.rule?.group,
          traffic.includes('Grouped · feat/checkout'),
          [off.group?.enabled, off.problems?.[0]?.startsWith("It's off")],
          passed.status,
          [tried.answeredBy, tried.alsoMatching?.map((rule) => [rule.title, rule.group])],
          report.problems?.some((problem) =>
            problem.startsWith('Its group “feat/checkout” is off'),
          ),
          [
            copied.created,
            copied.group?.position,
            copied.group?.enabled,
            copied.group?.rules,
          ],
          [renamed.created, renamed.group?.name, renamed.group?.enabled],
          [deleted.deleted?.name, deleted.rules?.map((rule) => rule.name)],
          gone,
          back,
          (await stored()).map((rule) => rule.name),
        ],
        [
          [true, 'feat/checkout', 0],
          { status: 200, body: { grouped: true } },
          [0, true, 1],
          ['feat/checkout', true],
          'feat/checkout',
          true,
          [false, true],
          404,
          [null, [['Grouped', { name: 'feat/checkout', enabled: false }]]],
          true,
          [true, 1, true, 1],
          [false, 'PR-12', false],
          ['feat/checkout-2', ['Grouped']],
          ['PR-12'],
          [
            ['PR-12', 0],
            ['feat/checkout-2', 1],
          ],
          ['Agent made', 'Real user'],
        ],
      );
    },
  );

  await check(
    "a page that isn't on a dev host stays in the browser: its requests, what the rules did there, and its address and title",
    async () => {
      await page.goto(`${EVIL_ORIGIN}/`);
      await app.waitForFunction(() => true);
      let said;
      for (let attempt = 0; attempt < 30; attempt++) {
        said = await tool('status');
        if (said.page?.devHost === false) break;
        await sleep(100);
      }
      const requests = await tool('recent_requests');
      const one = await tool('get_request', { id: real });
      const listed = await tool('list_rules');
      // A path, which would be on that page's site.
      const tried = await tool('try_url', { url: '/api/user' });
      await page.goto(`${ORIGIN}/`);
      const told = JSON.stringify([said, requests, one, tried]);
      const away = "The editor is watching a page that isn't on localhost";
      expect(
        [
          said.page,
          requests.error?.startsWith(away),
          one.error?.startsWith(away),
          listed.rules?.every((rule) => rule.didHere === undefined),
          tried.error?.startsWith("“/api/user” isn't a URL: give it in full"),
          told.includes('evil') || told.includes(String(new URL(EVIL_ORIGIN).port)),
        ],
        [{ devHost: false }, true, true, true, true, false],
      );
    },
  );

  await check(
    "only an extension's page may connect: the page's own WebSocket to ghostfetch-mcp is turned away",
    async () => {
      const opened = await page.evaluate(
        (port) =>
          new Promise((resolve) => {
            const socket = new WebSocket(`ws://127.0.0.1:${port}/`);
            socket.addEventListener('open', () => resolve('opened'));
            socket.addEventListener('close', (event) => resolve(`closed ${event.code}`));
          }),
        PORT,
      );
      expect(opened, 'closed 1006');
    },
  );

  await check(
    'every open editor connects; turned off in one, it is off in all, and on again with the code it remembers',
    async () => {
      // A second editor (say, the side panel beside the editor's tab) connects by itself.
      const second = await openEditor();
      await waitButton('connected', second);
      await app.click('[data-testid="agent-off"]');
      await waitStatus('Off');
      await waitButton('off', second);
      const off = await tool('status');
      await second.close();
      // On again: the code is filled in.
      const remembered = await app.inputValue('[data-testid="agent-code"]');
      await app.click('[data-testid="agent-on"]');
      await waitStatus('Connected');
      expect(
        [off.text?.startsWith("Ghostfetch isn't connected."), remembered],
        [true, code],
      );
    },
  );

  await check(
    "with ghostfetch-mcp gone (the agent's session ended) the editor waits, and connects again when it's back",
    async () => {
      await agent.close();
      await waitStatus('Waiting');
      const waiting = await app.textContent('[data-testid="agent-words"]');
      agent = await startAgent(AGENT);
      await waitStatus('Connected');
      const said = await tool('list_rules');
      expect(
        [waiting, said.rules?.length],
        [
          `Waiting for ghostfetch-mcp on port ${PORT}, which runs while your agent's session does.`,
          2,
        ],
      );
    },
  );

  await check(
    'a second ghostfetch-mcp (another agent session, or OpenCode in another directory) works through the first, and takes the port when the first ends',
    async () => {
      const second = await startAgent(AGENT);
      // It finds the port taken and joins the first, which takes it a moment.
      let through;
      for (let attempt = 0; attempt < 30; attempt++) {
        through = await second.tool('list_rules');
        if (through.rules) break;
        await sleep(100);
      }
      const saved = await second.tool('save_rule', {
        id: made,
        name: 'Agent made, renamed by the second',
      });
      await agent.close();
      agent = second;
      await waitStatus('Connected');
      const after = await tool('get_rule', { id: made });
      expect(
        [through.rules?.length, saved.rule?.name, after.rule?.name],
        [2, 'Agent made, renamed by the second', 'Agent made, renamed by the second'],
      );
    },
  );

  await check(
    "save_rule changes what a rule applies to (its URL, host and port included, mode and method) and what it answers with (status, headers set and removed, content type, delay, the server's own body), each on the page at once",
    async () => {
      const host = new URL(ORIGIN).host;
      // What the page gets: the status, the body, the headers in question, and how long it took.
      const fetched = (method, url) =>
        page.evaluate(
          async ([how, where]) => {
            const started = performance.now();
            const response = await fetch(where, { method: how });
            const text = await response.text();
            const headers = {};
            for (const name of ['content-type', 'x-real', 'x-flag'])
              if (response.headers.has(name)) headers[name] = response.headers.get(name);
            return {
              status: response.status,
              text,
              headers,
              ms: performance.now() - started,
            };
          },
          [method, url],
        );
      // Whether the rule answered it.
      const ruled = async (method, url) =>
        (await fetched(method, url)).text.includes('"agent"');
      const id = (
        await tool('save_rule', {
          name: 'Retargeted',
          match: { url: 'localhost:5173/api/user', method: 'GET' },
          response: { body: { from: 'agent' } },
        })
      ).rule?.id;
      const seen = [];
      // Another app's host and port, then this one's.
      seen.push(await ruled('GET', '/api/user?case=retarget'));
      await tool('save_rule', { id, match: { url: `${host}/api/user` } });
      seen.push(await ruled('GET', '/api/user?case=retarget'));
      await tool('save_rule', { id, match: { mode: 'equals', url: '/api/user?id=7' } });
      seen.push(
        await ruled('GET', '/api/user?id=7'),
        await ruled('GET', '/api/user?id=8'),
      );
      await tool('save_rule', {
        id,
        match: { mode: 'regex', url: String.raw`/api/user\?id=\d+$` },
      });
      seen.push(
        await ruled('GET', '/api/user?id=8'),
        await ruled('GET', '/api/user?id=x'),
      );
      await tool('save_rule', {
        id,
        match: { mode: 'wildcard', url: '*/api/users/*/orders', method: 'POST' },
      });
      seen.push(
        await ruled('POST', '/api/users/7/orders'),
        await ruled('GET', '/api/users/7/orders'),
      );
      await tool('save_rule', {
        id,
        response: {
          status: 201,
          contentType: 'text/plain',
          body: 'Order placed',
          delay: 600,
          headers: [{ name: 'X-Flag', value: 'beta' }],
        },
      });
      const answered = await fetched('POST', '/api/users/7/orders');
      // The server's own body, with its status changed, one of its headers removed and one added.
      const kept = (
        await tool('save_rule', {
          name: 'Kept',
          match: { url: '/api/user?case=kept', mode: 'equals' },
          response: {
            bodyMode: 'original',
            status: 500,
            headers: [
              { op: 'remove', name: 'x-real' },
              { name: 'X-Flag', value: 'kept' },
            ],
          },
        })
      ).rule?.id;
      const fromServer = await fetched('GET', '/api/user?case=kept');
      let logged;
      for (let attempt = 0; attempt < 20; attempt++) {
        logged = (await tool('recent_requests', { url: 'case=kept', limit: 1 }))
          .requests?.[0];
        if (logged) break;
        await sleep(150);
      }
      // As it found them.
      await tool('delete_rule', { id });
      await tool('delete_rule', { id: kept });
      expect(
        [
          seen,
          [answered.status, answered.text, answered.headers, answered.ms >= 550],
          [fromServer.status, JSON.parse(fromServer.text).name, fromServer.headers],
          [logged?.status, logged?.rule?.did],
        ],
        [
          [false, true, true, false, true, false, true, false],
          [201, 'Order placed', { 'content-type': 'text/plain', 'x-flag': 'beta' }, true],
          [500, 'Real', { 'content-type': 'application/json', 'x-flag': 'kept' }],
          [500, 'modified'],
        ],
      );
    },
  );

  await check('no uncaught errors in the pages', async () => {
    if (errors.length) throw new Error(errors.join('\n'));
  });
} finally {
  await agent.close().catch(() => {});
  await context.close();
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(TOKEN_DIR, { recursive: true, force: true });
}

finish();
