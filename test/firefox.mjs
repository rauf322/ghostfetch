// Firefox-family end-to-end check: loads Ghostfetch into Zen (or any Firefox build) over WebDriver
// BiDi with puppeteer-core, because Playwright can't load extensions into Firefox. It uses the
// same backend and rules as the Chromium test and covers what differs between the browsers: the
// background page, the page-world handoff and the traffic log.
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
  itemsBody,
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
      // Connects to the tab's log exactly like the editor's Traffic view does, and takes its first
      // part (all of a log under 8 million characters). Each entry: kind, method, path, action,
      // whether its body was cut, and how long the body kept is.
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === request.url);
      const port = chrome.tabs.connect(tab.id, { name: 'ghostfetch-log', frameId: 0 });
      return new Promise((resolve) => port.onMessage.addListener((reply) => {
        if (reply.type !== 'snapshot') return;
        port.disconnect();
        resolve(reply.entries.map((entry) => [entry.kind, entry.method, new URL(entry.url).pathname + new URL(entry.url).search, entry.action, entry.truncated, entry.responseBody.length]));
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
    // A non-localhost, a local.* hostname and one with an underscore that still reach the test
    // server.
    'network.dns.localDomains': 'evil.test,local.ghostfetch.test,my_app.test',
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
  await check("Merge and Script rules saved by 0.7 keep the server's body", async () => {
    expect((await call('/api/user?case=merge')).body, {
      id: 1,
      name: 'Real',
      role: 'user',
      profile: { city: 'Riga', age: 30 },
      tags: ['a', 'b'],
    });
    const scripted = await call('/api/user?case=script');
    expect([scripted.body.name, 'sawUrl' in scripted.body], ['Real', false]);
  });
  await check(
    "server's body reaches the page as the server sent it: bytes that aren't text, a response as it arrives, a charset over XHR",
    async () => {
      // Up to 0.20.1 the body went through UTF-8 text on its way, and all of it before the page
      // got any. With a rule that sets nothing else, and with one that sets a header too.
      for (const query of ['case=keep', 'case=kept-header']) {
        const got = await page.evaluate(async (q) => {
          const bytes = new Uint8Array(
            await (await fetch(`/api/bytes?${q}`)).arrayBuffer(),
          );
          const started = performance.now();
          const reader = (await fetch(`/api/slow?${q}`)).body.getReader();
          await reader.read();
          const first = performance.now() - started;
          while (!(await reader.read()).done);
          const whole = performance.now() - started;
          const over = (target, type) =>
            new Promise((resolve) => {
              const request = new XMLHttpRequest();
              request.open('GET', target);
              request.responseType = type;
              request.addEventListener('loadend', () => resolve(request.response));
              request.send();
            });
          return {
            bytes: [bytes.length, bytes[255]],
            arrivesFirst: first < 400 && whole > 550,
            overXhr: (await over(`/api/bytes?${q}`, 'arraybuffer')).byteLength,
            text: await over(`/api/cp1251?${q}`, ''),
            timing: `${Math.round(first)} of ${Math.round(whole)} ms`,
          };
        }, query);
        const { timing, ...seen } = got;
        expect(
          seen,
          { bytes: [2048, 255], arrivesFirst: true, overXhr: 2048, text: 'Привет' },
          `${query} (first bytes after ${timing})`,
        );
      }
    },
  );
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

  await check('redirect, header and block rules saved by 0.8 do nothing', async () => {
    const redirect = await call('/api/old-home');
    const echoed = await call('/api/echo');
    const blocked = await call('/api/blocked');
    expect(
      [
        redirect.status,
        echoed.body.headers['x-debug'],
        echoed.headers['x-resp'],
        blocked.error,
        blocked.status,
      ],
      [404, undefined, undefined, undefined, 404],
    );
  });
  await check('master switch off disables every rule, on restores them', async () => {
    await setStorage({ enabled: false });
    await sleep(500);
    expect((await call('/api/user?case=replace')).body.name, 'Real');
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
  await check(
    "a stream that doesn't end is logged with its first 1 MB, and the page still gets the rest",
    async () => {
      // Up to 0.20.0 the copy Ghostfetch reads was read to its end, which this never reaches: no
      // entry, and the whole stream so far held in the tab.
      const stream = await open(`${ORIGIN}/stream`, 'stream');
      let entry;
      for (let attempt = 0; attempt < 25 && !entry; attempt++) {
        await sleep(200);
        entry = (await send({ command: 'traffic', url: `${ORIGIN}/stream` })).find(
          ([, , entryPath]) => entryPath === '/api/stream',
        );
      }
      const before = await stream.evaluate(() => window.received);
      await sleep(400);
      const after = await stream.evaluate(() => window.received);
      await stream.close();
      expect(
        [entry?.slice(4), before > 1_000_000, after > before],
        [[true, 1_000_000], true, true],
      );
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
  await check(
    "a built-in the page patches can't reach the interceptor's functions through .caller",
    async () => {
      const probe = await open(`${ORIGIN}/steal-caller`, '/steal-caller');
      await sleep(600);
      const { response, stolen } = await probe.evaluate(() => window.attack());
      await probe.close();
      // Only the page's own decoy: the interceptor is strict mode, so the browser hides it.
      expect(stolen, ['decoy']);
      expect(response, { name: 'Mocked' }, 'mocking still works');
    },
  );
  await check('local.* hosts get mocks, from the first request on', async () => {
    const probe = await open(`${LOCAL_ORIGIN}/`, 'local.*');
    const early = await probe.evaluate(() => window.early);
    const later = await probe.evaluate(() =>
      fetch('/api/user?case=replace').then((response) => response.json()),
    );
    await probe.close();
    expect([early, later], [{ early: 'mocked' }, { name: 'Mocked' }]);
  });
  await check('Ghostfetch does nothing on sites that are not turned on', async () => {
    const probe = await open(`${EVIL_ORIGIN}/steal`, 'evil.test');
    await sleep(600);
    const r = await probe.evaluate(async () => ({
      wrapped: !String(window.fetch).includes('[native code]'),
      mock: await fetch('/api/user?case=replace').then((x) => x.json()),
      stolen: window.stolen,
    }));
    await probe.close();
    expect([r.wrapped, r.mock.name, r.stolen], [false, 'Real', []]);
  });
  await check(
    'a site you add gets Ghostfetch (registered at runtime) and loses it when removed',
    async () => {
      // The popup and Traffic buttons save the list the same way, then the background re-registers.
      const visit = async (label) => {
        const probe = await open(`${EVIL_ORIGIN}/`, label);
        const r = await probe.evaluate(async () => ({
          early: await window.early,
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
          { early: { early: 'mocked' }, wrapped: true },
          { early: { early: 'real' }, wrapped: false },
        ],
      );
    },
  );
  await check(
    'a site with an underscore in its name gets Ghostfetch, with an IPv6 address added beside it',
    async () => {
      // Up to 0.20.1 neither could be a site. Firefox has to take both content-script patterns:
      // were it to refuse one, it would register neither, and my_app.test would get nothing.
      await setStorage({ sites: ['my_app.test', '[::1]'] });
      await sleep(800);
      const probe = await open(
        `${ORIGIN.replace('127.0.0.1', 'my_app.test')}/`,
        'my_app.test added',
      );
      const r = await probe.evaluate(async () => ({
        early: await window.early,
        wrapped: !String(window.fetch).includes('[native code]'),
      }));
      await probe.close();
      await setStorage({ sites: [] });
      await sleep(500);
      expect(r, { early: { early: 'mocked' }, wrapped: true });
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
    'vim keeps the cursor in view on a long body (Firefox also scrolls to the caret itself), the block exactly on its character 15,000 lines down',
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
      // The cursor's layer holds its line alone, and scrolls as far as the textarea does.
      seen.push(
        await editorTab.evaluate(() => {
          const text = document.querySelector('.code-cursor .code-text');
          const { textarea } = window.editor;
          return [
            text.textContent.includes('\n'),
            text.parentElement.scrollHeight >= textarea.scrollHeight,
          ];
        }),
      );
      // The block sits exactly on its character, where the coloured text has it, in a body of
      // 15,000 lines: a line height off by a hair would add up that far down.
      await editorTab.evaluate(
        (text) => {
          const { textarea } = window.editor;
          textarea.value = text;
          textarea.setSelectionRange(0, 0);
          textarea.dispatchEvent(new Event('input'));
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
        editorTab.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const { textarea } = window.editor;
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
                      resolve(
                        Math.abs(char.top - block.top) < 1 &&
                          Math.abs(char.left - block.left) < 1,
                      );
                      return;
                    }
                    offset -= node.length;
                  }
                  resolve(false);
                }),
              ),
            ),
        );
      for (const keys of ['G', '50%', 'gg']) {
        await typeVim(keys);
        seen.push([`${keys} on its character`, await onItsCharacter()]);
      }
      expect(seen, [
        ['G', true],
        ['gg', true],
        ['50%', true],
        ['<C-d>', true],
        ['<C-u>', true],
        [false, true],
        ['G on its character', true],
        ['50% on its character', true],
        ['gg on its character', true],
      ]);
    },
  );
  await check(
    "text size: Ctrl with = and - grow and shrink the text around the cursor's line, which stays where it is in the view",
    async () => {
      // How far down the text area the middle of vim's cursor is, once Firefox has scrolled (two
      // frames).
      const cursorMiddle = () =>
        editorTab.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const cursor = document
                    .querySelector('.code-cursor .cursor')
                    .getBoundingClientRect();
                  const view = window.editor.textarea.getBoundingClientRect();
                  resolve((cursor.top + cursor.bottom) / 2 - view.top);
                }),
              ),
            ),
        );
      await typeVim('gg120G');
      const start = await cursorMiddle();
      const seen = [];
      for (const key of ['=', '=', '=', '-', '0']) {
        await editorTab.keyboard.down('Control');
        await editorTab.keyboard.press(key);
        await editorTab.keyboard.up('Control');
        seen.push([key, Math.abs((await cursorMiddle()) - start) <= 1]);
      }
      expect(seen, [
        ['=', true],
        ['=', true],
        ['=', true],
        ['-', true],
        ['0', true],
      ]);
    },
  );
  await check(
    "Format keeps vim's cursor on its character and its line where it was in the view (Firefox also scrolls to the caret itself), and a new editor goes back to the same place",
    async () => {
      const body = itemsBody(80);
      await editorTab.evaluate((text) => {
        const { textarea } = window.editor;
        textarea.value = text;
        textarea.setSelectionRange(0, 0);
        textarea.dispatchEvent(new Event('input'));
      }, body);
      // Once Firefox has scrolled (two frames): the text from the cursor on, vim's line for it,
      // and how far down the view its block is.
      const cursor = () =>
        editorTab.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const { textarea } = window.editor;
                  const block = document
                    .querySelector('.code-cursor .cursor')
                    .getBoundingClientRect();
                  const at = textarea.selectionStart;
                  resolve({
                    on: textarea.value.slice(at, at + 7),
                    line: /Ln (\d+)/.exec(
                      document.querySelector('.code-vim-pos').textContent,
                    )[1],
                    y: Math.round(block.top - textarea.getBoundingClientRect().top),
                  });
                }),
              ),
            ),
        );
      await typeVim('/item 40<CR>');
      await editorTab.evaluate(() => {
        const { textarea } = window.editor;
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
        const line =
          textarea.value.slice(0, textarea.selectionStart).split('\n').length - 1;
        textarea.scrollTop = line * lineHeight - textarea.clientHeight / 3;
      });
      const placed = await cursor();
      await editorTab.evaluate(() =>
        window.editor.replace(window.formatJson(window.editor.value)),
      );
      const formatted = await cursor();
      // Another editor of the same text, given the first one's place.
      const again = await editorTab.evaluate(
        () =>
          new Promise((resolve) => {
            const first = window.editor;
            const second = window.createCodeEditor({ value: first.value });
            first.root.after(second.root);
            second.setPlace(first.place);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                resolve([
                  second.textarea.selectionStart === first.textarea.selectionStart,
                  Math.abs(second.textarea.scrollTop - first.textarea.scrollTop) <= 1,
                  second.root.querySelector('.code-vim-pos').textContent ===
                    first.root.querySelector('.code-vim-pos').textContent,
                ]);
                second.root.remove();
              }),
            );
          }),
      );
      expect(
        [
          formatted.on,
          formatted.line !== placed.line,
          Math.abs(formatted.y - placed.y) <= 1,
          again,
        ],
        ['item 40', true, true, [true, true, true]],
        JSON.stringify([placed, formatted]),
      );
    },
  );
  await check(
    "vim: u right after Format puts the cursor back where it was before it and Ctrl+R where it was after it, Visual mode carries on through Format, and after a Format too long to undo, u says there's nothing to undo, but undoes the changes made since, back to the formatted body (x, then P, which puts it back as it was)",
    async () => {
      const strip = (text) => text.replace(/[ \n\t\r]/g, '');
      const put = (text) =>
        editorTab.evaluate((value) => {
          const { textarea } = window.editor;
          textarea.value = value;
          textarea.setSelectionRange(0, 0);
          textarea.dispatchEvent(new Event('input'));
        }, text);
      const format = () =>
        editorTab.evaluate(() =>
          window.editor.replace(window.formatJson(window.editor.value)),
        );
      const state = () =>
        editorTab.evaluate(() => {
          const { textarea } = window.editor;
          return {
            text: textarea.value,
            at: /Ln \d+, Col \d+/.exec(
              document.querySelector('.code-vim-pos').textContent,
            )[0],
            mode: document.querySelector('.code-vim-mode').textContent,
            message: document.querySelector('.code-vim-keys').textContent,
            selected: textarea.value.slice(
              textarea.selectionStart,
              textarea.selectionEnd,
            ),
          };
        });
      // 40 items: Format is an edit the browser can undo.
      const fewer = itemsBody(40);
      await put(fewer);
      await typeVim('/item 30<CR>');
      const was = await state();
      await format();
      const formatted = await state();
      await typeVim('u');
      const undone = await state();
      await typeVim('<C-r>');
      const redone = await state();
      await put(fewer);
      await typeVim('/item 30<CR>vjj');
      const visual = await state();
      await format();
      const carried = await state();
      await typeVim('<Esc>');
      // 80: Format puts them in directly.
      await put(itemsBody(80));
      await format();
      const long = (await state()).text;
      await typeVim('u');
      const refused = await state();
      await typeVim('/item 40<CR>x');
      const deleted = (await state()).text;
      await typeVim('P');
      const back = [(await state()).text];
      for (let step = 0; step < 3; step++) {
        await typeVim('u');
        back.push((await state()).text);
      }
      const named = (text) =>
        text === long ? 'formatted' : text === deleted ? 'x' : `${text.length} chars`;
      expect(
        [
          undone.text === fewer,
          undone.at,
          redone.text === formatted.text,
          redone.at,
          visual.mode,
          carried.mode,
          strip(carried.selected) === strip(visual.selected),
          refused.text === long,
          refused.message,
          back.map(named),
          (await state()).message,
        ],
        [
          true,
          was.at,
          true,
          formatted.at,
          'Visual',
          'Visual',
          true,
          true,
          'Already at oldest change',
          ['formatted', 'x', 'formatted', 'formatted'],
          'Already at oldest change',
        ],
      );
    },
  );
  await check(
    'vim: a yank goes to the clipboard as well, and a delete leaves it alone (Firefox lets a page write it only during a key press or a click)',
    async () => {
      const accel = process.platform === 'darwin' ? 'Meta' : 'Control';
      // Each write the editor makes, still the browser's own, kept so a paste can wait for it to
      // land (as in the Chrome test).
      await editorTab.evaluate(() => {
        const write = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = (text) => (window.lastWrite = write(text));
      });
      // What's on the clipboard: pasted into a text area of its own, as into another app. A
      // headless browser keeps a clipboard of its own, so this leaves yours alone (unless HEADED
      // is set).
      const clipboard = async () => {
        await editorTab.evaluate(() => {
          const probe = document.createElement('textarea');
          probe.id = 'paste-probe';
          document.body.append(probe);
          probe.focus();
          return window.lastWrite;
        });
        await editorTab.keyboard.down(accel);
        await editorTab.keyboard.press('v');
        await editorTab.keyboard.up(accel);
        const pasted = await editorTab.evaluate(() => {
          const probe = document.getElementById('paste-probe');
          probe.remove();
          return probe.value;
        });
        await editorTab.evaluate(() => window.editor.textarea.focus());
        return pasted;
      };
      await editorTab.evaluate((text) => {
        const { textarea } = window.editor;
        textarea.value = text;
        textarea.setSelectionRange(0, 0);
        textarea.dispatchEvent(new Event('input'));
      }, VIM_START);
      const seen = [];
      for (const keys of ['jwvi"y', 'Vjy', 'Gkf[y%', 'xu']) {
        await typeVim(keys);
        seen.push([keys, await clipboard()]);
      }
      await editorTab.evaluate(() => delete navigator.clipboard.writeText);
      expect(seen, [
        ['jwvi"y', 'name'],
        ['Vjy', '  "name": "Ada",\n  "role": "admin",\n'],
        ['Gkf[y%', '[1, 2, 3]'],
        ['xu', '[1, 2, 3]'],
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
