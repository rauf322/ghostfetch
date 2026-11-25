// The screenshot suite's browser, as Playwright Test fixtures: the built extension
// (.output/chrome-mv3) in Chromium, loaded as test/e2e.mjs loads it, with the test server of
// test/fixtures.mjs on a fixed port, a handful of rules, and one page's traffic; then each view on
// a page of its own (editor() and popup()).
//
// Nothing in a picture is live. Every page shows the same time, NOW (Playwright's clock, which the
// whole context shares, Date fixed and timers running). The page's requests were sent minutes and
// seconds before NOW, one after another, each taking a set time: their Date.now() is set back for
// each, and their performance.now(), which Ghostfetch's interceptor reads as a request is sent and
// as it ends (interception/fetch.ts, log-entries.ts), steps by that time at each read. A view
// opens with localStorage cleared, its theme and Appearance set before it draws, as
// public/theme.js reads them; and the pointer is moved off whatever a click left it on. The rest
// (animations, the caret, fonts) is toHaveScreenshot's, set in playwright.config.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base } from '@playwright/test';
import { createRule } from '../../src/bounded-contexts/rules/index.ts';
import { CHROME_BUILD, requireBuild, sleep, startServer } from '../fixtures.mjs';

export { expect } from '@playwright/test';

const EXTENSION = requireBuild(CHROME_BUILD);
// The pictures show the server's port (in the page's address and title).
const PORT = 47_219;
const ORIGIN = `http://127.0.0.1:${PORT}`;
// 10:30:00.500 UTC on 15 June 2026, half a second in, so a request sent a few ms before is in the
// same second.
export const NOW = Date.UTC(2026, 5, 15, 10, 30, 0, 500);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
export const WIDE = { width: 1280, height: 800 };
export const NARROW = { width: 420, height: 800 };

const json = (value) => JSON.stringify(value, null, 2);
const rule = (id, name, match, response = {}, fields = {}) => {
  const made = createRule();
  return {
    ...made,
    id,
    name,
    createdAt: NOW - 3 * 24 * 60 * MINUTE,
    updatedAt: NOW - 3 * 24 * 60 * MINUTE,
    ...fields,
    match: { ...made.match, ...match },
    response: { ...made.response, ...response },
  };
};
// A rule in no group with the server's response kept for its Diff; a group, PR 412, of two; and
// one that's off.
const STORED = {
  enabled: true,
  record: true,
  rules: [
    rule(
      'pro',
      'Pro plan user',
      { url: '/api/user?plan=pro', method: 'GET' },
      {
        body: json({
          id: 42,
          name: 'Ada Lovelace',
          email: 'ada@acme.dev',
          plan: 'pro',
          seats: 25,
        }),
      },
    ),
    rule(
      'flags',
      'Feature flags',
      { url: '/api/flags' },
      { body: json({ newCheckout: true, darkMode: false }) },
      { group: 'pr-412' },
    ),
    rule(
      'checkout',
      'Checkout fails',
      { url: '/api/checkout', method: 'POST' },
      { status: '500', body: json({ error: 'card_declined' }) },
      { group: 'pr-412' },
    ),
    rule(
      'orders',
      'Empty orders',
      { url: '/api/orders' },
      { body: '[]' },
      { enabled: false },
    ),
  ],
  groups: [
    {
      id: 'pr-412',
      name: 'PR 412 · checkout',
      enabled: true,
      createdAt: NOW - MINUTE,
      updatedAt: NOW - MINUTE,
      at: 1,
    },
  ],
  'serverResponse:pro': {
    body: json({
      id: 42,
      name: 'Ada Lovelace',
      email: 'ada@acme.dev',
      plan: 'free',
      seats: 1,
    }),
    status: 200,
    time: NOW - 2 * 60 * MINUTE,
    truncated: false,
  },
};
// The page's requests, oldest first: [URL, how long before NOW it was sent, how long it took,
// fetch()'s options]. Three of them rules answer; the one Empty orders would is the server's, as
// that rule is off.
const SENT = [
  ['/api/user?id=7', 7 * MINUTE, 182],
  ['/api/user?plan=pro', 4 * MINUTE, 38],
  ['/graphql', 2 * MINUTE, 264, { method: 'POST', body: '{"operationName":"GetCart"}' }],
  ['/api/orders?status=open', 50 * SECOND, 73],
  ['/api/flags', 20 * SECOND, 12],
  ['/api/user?plan=pro', 8 * SECOND, 41],
  ['/api/checkout', 3 * SECOND, 95, { method: 'POST', body: '{"cart":42}' }],
  ['/api/user?q=invoices&page=2', 0, 120],
];

// Runs in the page: sends each request once the one before has ended, as said above.
async function send(requests) {
  const fixed = Date.now;
  let ticks = 0;
  let step = 0;
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => (ticks += step),
  });
  for (const [url, ago, took, init] of requests) {
    Date.now = () => fixed.call(Date) - ago;
    step = took;
    try {
      await (await fetch(url, init)).text();
    } catch {
      // A failed request is in the log too.
    }
  }
  Date.now = fixed;
  document.title = 'Acme Shop';
}

// Sets localStorage on one of Ghostfetch's pages (they share it): cleared, then the keys given.
const resetStorage = (page, keys) =>
  page.evaluate((entries) => {
    localStorage.clear();
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, Object.entries(keys));

// The keys a theme and Appearance's steps are kept under (src/ui/theme.ts).
const settings = ({ theme, appearance = {} }) => ({
  ...(theme && { 'ghostfetch.theme': theme }),
  ...Object.fromEntries(
    Object.entries(appearance).map(([setting, step]) => [`ghostfetch.${setting}`, step]),
  ),
});

export const test = base.extend({
  // The browser, set up once for the run (the suite runs in one worker): the extension, its rules,
  // the clock at NOW, and the page with its traffic, which every view watches.
  shop: [
    async ({ playwright }, use) => {
      const { server } = await startServer({ port: PORT });
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-visual-'));
      const context = await playwright.chromium.launchPersistentContext(userDataDir, {
        // The Chromium `npm run browsers` installs, in its new headless mode, which (unlike the
        // headless shell) loads extensions.
        channel: 'chromium',
        headless: true,
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [
          `--disable-extensions-except=${EXTENSION}`,
          `--load-extension=${EXTENSION}`,
        ],
        viewport: WIDE,
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      try {
        const worker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
        const id = new URL(worker.url()).host;
        // Extension APIs are bound a moment after the worker starts.
        for (
          let attempt = 0;
          attempt < 50 &&
          !(await worker.evaluate(() => Boolean(globalThis.chrome?.storage)));
          attempt++
        )
          await sleep(100);
        await worker.evaluate((values) => chrome.storage.local.set(values), STORED);
        await context.clock.setFixedTime(NOW);
        const site = context.pages()[0] ?? (await context.newPage());
        await site.goto(`${ORIGIN}/__control?visual`);
        await site.evaluate(send, SENT);
        // The last report on its way to the tab's log.
        await sleep(300);
        await use({ context, id, worker, site });
      } finally {
        await context.close();
        server.close();
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],

  // Opens the editor on a page of its own, `size` (WIDE or NARROW), on `view` ('rules' or
  // 'traffic'), the rule named `rule` open, with a theme and Appearance's steps if given.
  editor: async ({ shop }, use) => {
    const opened = [];
    await use(
      async ({ size = WIDE, view = 'rules', rule: name, theme, appearance } = {}) => {
        const page = await shop.context.newPage();
        opened.push(page);
        await page.setViewportSize(size);
        await page.goto(`chrome-extension://${shop.id}/sidepanel.html`);
        await resetStorage(page, {
          'ghostfetch.view': view,
          ...settings({ theme, appearance }),
        });
        await page.reload();
        await page
          .locator(
            view === 'traffic' ? '[data-testid="request"]' : '[data-testid="rule"]',
          )
          .first()
          .waitFor();
        if (name) {
          await page.locator('[data-testid="rule"]', { hasText: name }).first().click();
          await page.locator('[data-testid="rule-name"]').waitFor();
        }
        await page.mouse.move(0, 0);
        await page.evaluate(() => document.fonts.ready);
        return page;
      },
    );
    for (const page of opened) await page.close();
  },

  // Opens the popup as the toolbar would, beside the page with the traffic: in a tab behind it,
  // which takes that page's tab as the one it's about. 330 wide; a shot of its <body> is its own
  // height.
  popup: async ({ shop }, use) => {
    const opened = [];
    await use(async ({ theme, appearance } = {}) => {
      await shop.site.bringToFront();
      const created = shop.context.waitForEvent('page', {
        predicate: (page) => page.url().includes('popup.html'),
      });
      await shop.worker.evaluate(() =>
        chrome.tabs.create({ url: 'popup.html', active: false }),
      );
      const page = await created;
      opened.push(page);
      await page.setViewportSize({ width: 330, height: 600 });
      await page.waitForLoadState();
      await resetStorage(page, settings({ theme, appearance }));
      await page.reload();
      await page.locator('[data-testid="popup-rule"]').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      return page;
    });
    for (const page of opened) await page.close();
  },
});
