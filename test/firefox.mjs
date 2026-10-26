// Firefox-family end-to-end check: loads Ghostfetch into Zen (or any Firefox build) over WebDriver
// BiDi with puppeteer-core, because Playwright can't load extensions into Firefox. It uses the
// same backend and rules as the Chromium test and covers what differs between the browsers: the
// background page, the page-world handoff, declarativeNetRequest and the traffic log.
//
//   npm run test:firefox                          Zen from /Applications
//   FIREFOX=/path/to/firefox npm run test:firefox
//
// Set HEADED=1 to watch it.
//
// Firefox's automation can't open or script extension pages (it reports them as about:blank),
// so the editor and popup are covered by the Chromium test, which runs the same code. To set
// rules, this test loads a temporary copy of the built extension (.output/firefox-mv3) with two
// test-only hooks; the build itself is never touched:
// - a content script on /__control that writes extension storage when that page asks;
// - a background listener that reports what only extension code can see.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from 'puppeteer-core';
import {
  FIREFOX_BUILD,
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

const FIREFOX = process.env.FIREFOX || '/Applications/Zen.app/Contents/MacOS/zen';

const CONTENT_HOOK = `
window.addEventListener('message', async (event) => {
  const request = event.data?.ghostfetchTest;
  if (event.source !== window || !request) return;
  const result = request.command === 'setStorage'
    ? await chrome.storage.local.set(request.values)
    : await chrome.runtime.sendMessage({ ghostfetchTest: request });
  window.postMessage({ ghostfetchTestReply: { id: request.id, result: result ?? null } }, '*');
});
`;

const BACKGROUND_HOOK = `
// Test-only, added to a temporary copy by test/firefox.mjs.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const request = message?.ghostfetchTest;
  if (!request) return undefined;
  (async () => {
    if (request.command === 'apis') {
      return { sidebarOpen: typeof chrome.sidebarAction?.open, sidePanel: typeof chrome.sidePanel };
    }
    if (request.command === 'traffic') {
      // Connects to the tab's log exactly like the editor's Traffic view does.
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === request.url);
      const port = chrome.tabs.connect(tab.id, { name: 'ghostfetch-log', frameId: 0 });
      return new Promise((resolve) => port.onMessage.addListener((reply) => {
        if (reply.type !== 'snapshot') return;
        port.disconnect();
        resolve(reply.entries.map((entry) => [entry.kind, entry.method, new URL(entry.url).pathname + new URL(entry.url).search, entry.action]));
      }));
    }
    return null;
  })().then(sendResponse);
  return true;
});
`;

function makeTestCopy() {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-firefox-'));
  fs.cpSync(requireBuild(FIREFOX_BUILD), copy, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
  manifest.content_scripts.push({
    matches: ['*://127.0.0.1/__control*'],
    js: ['test-hook.js'],
    run_at: 'document_start',
  });
  fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(copy, 'test-hook.js'), CONTENT_HOOK);
  fs.appendFileSync(path.join(copy, 'background.js'), BACKGROUND_HOOK);
  return copy;
}

const { server, ORIGIN, EVIL_ORIGIN, LOCAL_ORIGIN } = await startServer();
const RULES = testRules(ORIGIN);
const COPY = makeTestCopy();
const browser = await launch({
  browser: 'firefox',
  executablePath: FIREFOX,
  headless: !process.env.HEADED,
  extraPrefsFirefox: {
    // A non-localhost and a local.* hostname that still reach the test server.
    'network.dns.localDomains': 'evil.test,local.ghostfetch.test',
    // Keep the plain-http test pages plain.
    'dom.security.https_first': false,
    'dom.security.https_first_schemeless': false,
    'dom.security.https_only_mode': false,
  },
});
const errors = [];

async function open(url, label) {
  const tab = await browser.newPage();
  tab.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  await tab.goto(url);
  return tab;
}

try {
  const installed = await browser.installExtension(COPY);
  console.log(
    `${await browser.version()}\nExtension ${installed}, test server ${ORIGIN}\n`,
  );

  const control = await open(`${ORIGIN}/__control`, 'control');
  let nextId = 0;
  const send = (request) =>
    control.evaluate(
      (payload) =>
        new Promise((resolve) => {
          const onReply = (event) => {
            if (event.data?.ghostfetchTestReply?.id !== payload.id) return;
            removeEventListener('message', onReply);
            resolve(event.data.ghostfetchTestReply.result);
          };
          addEventListener('message', onReply);
          postMessage({ ghostfetchTest: payload }, '*');
        }),
      { ...request, id: ++nextId },
    );
  const setStorage = (values) => send({ command: 'setStorage', values });
  await setStorage({ enabled: true, record: true, rules: RULES });
  await sleep(800);

  const page = await open(ORIGIN, 'page');
  const call = (url, init = {}) =>
    page.evaluate(
      async (target, options) => {
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
            url: response.url,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
      url,
      init,
    );
  const xhr = (url, responseType = '') =>
    page.evaluate(
      (target, type) =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest();
          const states = [];
          request.open('GET', target);
          request.responseType = type;
          // The on… handlers, as many apps use them: a mocked request has to fire them too.
          // oxlint-disable-next-line unicorn/prefer-add-event-listener
          request.onreadystatechange = () => states.push(request.readyState);
          // oxlint-disable-next-line unicorn/prefer-add-event-listener
          request.onloadend = () =>
            resolve({
              status: request.status,
              response: type === '' ? JSON.parse(request.responseText) : request.response,
              mockHeader: request.getResponseHeader('x-mock'),
              url: request.responseURL,
              states,
            });
          request.send();
        }),
      url,
      responseType,
    );

  console.log('page world (fetch and XHR)');
  await check('request fired by the page during load is mocked', async () => {
    expect(await page.evaluate(() => window.early), { early: 'mocked' });
  });
  await check('replace: body, status and custom header', async () => {
    const r = await call('/api/user?case=replace');
    expect([r.status, r.body, r.headers['x-mock']], [404, { name: 'Mocked' }, 'yes']);
  });
  await check('merge and script rules transform the real response', async () => {
    expect((await call('/api/user?case=merge')).body, {
      id: 1,
      name: 'Real',
      role: 'admin',
      profile: { city: 'Berlin', age: 30 },
      tags: ['z'],
    });
    const scripted = await call('/api/user?case=script');
    expect([scripted.body.name, scripted.body.sawUrl], ['REAL', true]);
  });
  await check('GraphQL operation, method, wildcard and regex matching', async () => {
    const graphql = (operationName) =>
      call('/graphql', {
        method: 'POST',
        body: JSON.stringify({ operationName, query: `query ${operationName} { x }` }),
      });
    expect((await graphql('GetUser')).body, { data: { user: 'mocked' } });
    expect((await graphql('Other')).body, { data: { real: true } });
    expect((await call('/api/user?case=method', { method: 'POST' })).body, {
      post: 'mocked',
    });
    expect((await call('/api/user?case=wild-anything')).body, { wild: true });
    expect((await call('/api/user?case=regex42')).body, { regex: true });
  });
  await check('XHR: status, body, headers, event order', async () => {
    const r = await xhr('/api/user?case=replace');
    expect(
      [r.status, r.response, r.mockHeader, r.states],
      [404, { name: 'Mocked' }, 'yes', [2, 3, 4]],
    );
  });
  await check('unmatched XHR goes to the network untouched', async () => {
    const r = await xhr('/api/user?case=none', 'json');
    expect(
      [r.status, r.response.name, r.url],
      [200, 'Real', `${ORIGIN}/api/user?case=none`],
    );
  });

  console.log('declarativeNetRequest (background page)');
  await check('redirect, request and response headers, block', async () => {
    const redirected = await call('/api/old-home');
    expect(
      [redirected.body, redirected.url],
      [{ redirected: true }, `${ORIGIN}/api/new-home`],
    );
    const echoed = await call('/api/echo');
    expect([echoed.body.headers['x-debug'], echoed.headers['x-resp']], ['1', 'ok']);
    if (!(await call('/api/blocked')).error) throw new Error('request was not blocked');
  });
  await check('master switch off disables every rule, on restores them', async () => {
    await setStorage({ enabled: false });
    await sleep(500);
    expect(
      [
        (await call('/api/user?case=replace')).body.name,
        (await call('/api/old-home')).status,
      ],
      ['Real', 404],
    );
    await setStorage({ enabled: true });
    await sleep(500);
    expect((await call('/api/user?case=replace')).body, { name: 'Mocked' });
  });

  console.log('traffic log and browser APIs');
  await check(
    "the traffic log records the tab's requests (what the Traffic view reads)",
    async () => {
      await call('/api/user?case=traffic-check');
      await sleep(300);
      const entries = await send({ command: 'traffic', url: `${ORIGIN}/` });
      const seen = (pathname, action) =>
        entries.some(
          ([kind, , entryPath, entryAction]) =>
            kind === 'fetch' && entryPath === pathname && entryAction === action,
        );
      if (
        !seen('/api/user?case=traffic-check', '') ||
        !seen('/api/user?case=replace', 'mocked')
      ) {
        throw new Error(`missing entries; got ${JSON.stringify(entries.slice(-6))}`);
      }
    },
  );
  await check('the sidebar API the "Open side panel" buttons use exists', async () => {
    expect(await send({ command: 'apis' }), {
      sidebarOpen: 'function',
      sidePanel: 'undefined',
    });
  });

  console.log('security');
  async function probeChannel(url) {
    const probe = await open(url, url);
    await sleep(600);
    const body = await probe.evaluate(() =>
      fetch('/api/user?case=replace').then((r) => r.json()),
    );
    await sleep(200);
    const stolen = await probe.evaluate(() => window.stolen);
    await probe.close();
    return { body, stolen };
  }
  for (const [name, pathname] of [
    ['a page cannot steal the rule channel while it loads', '/steal'],
    [
      'a page that patches the message plumbing still cannot get the channel',
      '/steal-patched',
    ],
    [
      'a page cannot slip the interceptor a forged channel with dispatchEvent()',
      '/steal-forged',
    ],
  ]) {
    await check(name, async () => {
      const { body, stolen } = await probeChannel(`${ORIGIN}${pathname}`);
      expect(stolen, []);
      expect(body, { name: 'Mocked' }, 'mocking still works');
    });
  }
  await check('local.* hosts get mocks and, once opened, header rules too', async () => {
    const probe = await open(`${LOCAL_ORIGIN}/`, 'local.*');
    const early = await probe.evaluate(() => window.early);
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
    expect([early, r.sent, r.received], [{ early: 'mocked' }, '1', 'ok']);
  });
  await check('Ghostfetch does nothing on sites that are not turned on', async () => {
    const probe = await open(`${EVIL_ORIGIN}/steal`, 'evil.test');
    await sleep(600);
    const r = await probe.evaluate(async () => ({
      wrapped: !String(window.fetch).includes('[native code]'),
      mock: await fetch('/api/user?case=replace').then((x) => x.json()),
      redirect: await fetch('/api/old-home').then((x) => x.status),
      stolen: window.stolen,
    }));
    await probe.close();
    expect([r.wrapped, r.mock.name, r.redirect, r.stolen], [false, 'Real', 404, []]);
  });
  await check(
    'a site you add gets Ghostfetch (registered at runtime) and loses it when removed',
    async () => {
      // The popup and Traffic buttons save the list the same way, then the background re-registers.
      const visit = async (label) => {
        const probe = await open(`${EVIL_ORIGIN}/`, label);
        const r = await probe.evaluate(async () => ({
          early: await window.early,
          sent: (await (await fetch('/api/echo')).json()).headers['x-debug'] ?? null,
          wrapped: !String(window.fetch).includes('[native code]'),
        }));
        await probe.close();
        return r;
      };
      await setStorage({ sites: ['evil.test'] });
      await sleep(800);
      const added = await visit('evil.test added');
      await setStorage({ sites: [] });
      await sleep(800);
      const removed = await visit('evil.test removed');
      expect(
        [added, removed],
        [
          { early: { early: 'mocked' }, sent: '1', wrapped: true },
          { early: { early: 'real' }, sent: null, wrapped: false },
        ],
      );
    },
  );

  console.log("vim keys in the body editor (the editor's own code, on a plain page)");
  const editorTab = await open(`${ORIGIN}/editor`, 'editor');
  await editorTab.waitForFunction(() => window.editor);
  const typeVim = async (keys) => {
    const press = {
      '<Esc>': 'Escape',
      '<CR>': 'Enter',
      '<BS>': 'Backspace',
      '<Del>': 'Delete',
    };
    for (const key of vimKeys(keys)) {
      if (press[key]) {
        await editorTab.keyboard.press(press[key]);
      } else if (key.startsWith('<C-')) {
        await editorTab.keyboard.down('Control');
        await editorTab.keyboard.press(key[3]);
        await editorTab.keyboard.up('Control');
      } else {
        await editorTab.keyboard.type(key);
      }
    }
  };
  await check('vim keys edit the body the same way as in Chrome', async () => {
    let expected = VIM_START;
    for (const [keys, after, cursor, message = ''] of VIM_STEPS) {
      await typeVim(keys);
      expected = after ?? expected;
      const state = await editorTab.evaluate(() => [
        window.editor.textarea.value,
        /Ln (\d+), Col (\d+)/
          .exec(document.querySelector('.code-vim-pos').textContent)
          .slice(1)
          .join(':'),
        document.querySelector('.code-vim-keys').textContent,
      ]);
      expect(state, [expected, cursor, message], keys);
    }
  });
  await check(
    'vim keeps the cursor in view on a long body (Firefox also scrolls to the caret itself)',
    async () => {
      const long = JSON.stringify(
        { items: Array.from({ length: 80 }, (_, id) => ({ id, name: `item ${id}` })) },
        null,
        2,
      );
      await editorTab.evaluate((text) => {
        const { textarea } = window.editor;
        textarea.value = text;
        textarea.setSelectionRange(0, 0);
        textarea.dispatchEvent(new Event('input'));
      }, long);
      // Firefox's own scrolling to the caret happens a frame later, so look after two.
      const inView = () =>
        editorTab.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const cursor = document
                    .querySelector('.code-cursor .cursor')
                    .getBoundingClientRect();
                  const view = window.editor.textarea.getBoundingClientRect();
                  resolve(cursor.top >= view.top && cursor.bottom <= view.bottom);
                }),
              ),
            ),
        );
      const seen = [];
      for (const keys of ['G', 'gg', '50%', '<C-d>', '<C-u>']) {
        await typeVim(keys);
        seen.push([keys, await inView()]);
      }
      expect(seen, [
        ['G', true],
        ['gg', true],
        ['50%', true],
        ['<C-d>', true],
        ['<C-u>', true],
      ]);
    },
  );
  await editorTab.close();

  await check('no uncaught errors in the pages', async () => {
    if (errors.length) throw new Error(errors.join('\n'));
  });
} finally {
  await browser.close();
  server.close();
  fs.rmSync(COPY, { recursive: true, force: true });
}

finish();
