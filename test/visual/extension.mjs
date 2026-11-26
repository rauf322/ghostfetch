// The screenshot suite's browsers, as Playwright Test fixtures: the built extension
// (.output/chrome-mv3) in Chromium, loaded as test/e2e.mjs loads it, with the test server of
// test/fixtures.mjs on a fixed port, some rules, and one page's traffic; then each view on a page
// of its own. Two browsers share the server: the views' (shop, at 1x, with editor() and popup()),
// and the flows' (flowShop, at 2x, with flowEditor() and flowPopup()), whose data is the demo's,
// as variant A's pictures have it, and whose pictures are of the parts a state is about.
//
// Nothing in a picture is live. Every page shows the same time, NOW (Playwright's clock, which a
// whole context shares, Date fixed and timers running). The page's requests were sent minutes and
// seconds before NOW, one after another, each taking a set time: their Date.now() is set back for
// each, and their performance.now(), which Ghostfetch's interceptor reads as a request is sent and
// as it ends (fetch.ts, xhr.ts and log-entries.ts in src/bounded-contexts/interception/), steps by
// that time at each read. A view opens with localStorage cleared, its theme and Appearance set
// before it draws, as public/theme.js reads them; and the pointer is moved off whatever a click
// left it on. A flow starts with the rules as stored and the clock at NOW again, and moves the
// clock itself (moveClock()). The rest (animations, the caret, fonts) is toHaveScreenshot's, set
// in playwright.config.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import { createRule } from '../../src/bounded-contexts/rules/index.ts';
import { CHROME_BUILD, requireBuild, sleep, startServer } from '../fixtures.mjs';

export { expect };

const EXTENSION = requireBuild(CHROME_BUILD);
// The pictures show the server's port (in the page's address and title).
const PORT = 47_219;
export const ORIGIN = `http://127.0.0.1:${PORT}`;
// 10:30:00.500 UTC on 15 June 2026, half a second in, so a request sent a few ms before is in the
// same second.
const NOW = Date.UTC(2026, 5, 15, 10, 30, 0, 500);
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
const group = (id, name, at, enabled = true) => ({
  id,
  name,
  enabled,
  createdAt: NOW - MINUTE,
  updatedAt: NOW - MINUTE,
  at,
});
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
  groups: [group('pr-412', 'PR 412 · checkout', 1)],
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
// fetch()'s options, and xhr: true for an XMLHttpRequest]. Three of them rules answer; the one
// Empty orders would is the server's, as that rule is off.
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

// The demo of variant A's pictures (reports/T3 Code design for Ghostfetch/A-*.png): six rules, a
// group for a PR (on), one that's off with a rule in it, and a rule that's off. Pro plan user
// answered 4 minutes ago, Feature flags 5, Slow search 12 and 15 (keeping the server's body, after
// 2 s); Checkout fails, on, hasn't, so it steps back.
const PRO_BODY = {
  id: 42,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@acme.dev',
  plan: 'pro',
  seats: 25,
  team: 'Acme Inc.',
};
const DEMO_STORED = {
  enabled: true,
  record: true,
  rules: [
    rule(
      'pro',
      'Pro plan user',
      { url: '/api/user', method: 'GET' },
      { body: json(PRO_BODY), headers: [{ op: 'set', name: 'X-Plan', value: 'pro' }] },
    ),
    rule(
      'checkout',
      'Checkout fails',
      { url: '/api/checkout', method: 'POST' },
      { status: '500', body: json({ error: 'card_declined' }) },
      { group: 'pr-412' },
    ),
    rule(
      'search',
      'Slow search',
      { url: '/api/search', method: 'GET' },
      { bodyMode: 'original', delay: 2000 },
      { group: 'pr-412' },
    ),
    rule(
      'flags',
      'Feature flags',
      { url: '/api/flags', method: 'GET' },
      { body: json({ newCheckout: true, darkMode: false }) },
    ),
    rule(
      'projects',
      'Empty project list',
      { url: '/api/projects', method: 'GET' },
      { body: '[]' },
      { enabled: false },
    ),
    rule(
      'invoices',
      'Invoices (GraphQL)',
      { url: '/graphql', method: 'POST', graphqlOperation: 'GetInvoices' },
      { body: json({ data: { invoices: [] } }) },
      { group: 'billing' },
    ),
  ],
  groups: [
    group('pr-412', 'PR 412 · checkout', 1),
    group('billing', 'Billing GraphQL', 4, false),
  ],
  // Pro plan user's body against the server's: +2 −1, as the demo's Diff row says.
  'serverResponse:pro': {
    body: json({ ...PRO_BODY, plan: 'free', seats: undefined }),
    status: 200,
    time: NOW - 2 * 60 * MINUTE,
    truncated: false,
  },
};
const DEMO_SENT = [
  ['/api/search?q=in', 15 * MINUTE, 2010],
  ['/api/search?q=inv', 12 * MINUTE, 2010],
  ['/api/flags', 5 * MINUTE, 0],
  ['/api/user', 4 * MINUTE, 1],
  [
    '/api/events',
    43 * SECOND,
    18,
    { method: 'POST', body: '{"event":"view"}', xhr: true },
  ],
  ['/api/projects', 41 * SECOND, 3],
];

// The flows' data: the demo's, and long URLs where a URL is cut in the middle (2b): a rule that
// answered on the page, and a request no rule answered, which New rule offers to mock.
const LONG_RULE_URL = '/api/v2/organizations/acme/billing/invoices?status=overdue';
const FLOW_STORED = {
  ...DEMO_STORED,
  rules: [
    ...DEMO_STORED.rules,
    rule(
      'overdue',
      'Overdue invoices',
      { url: LONG_RULE_URL, method: 'GET' },
      { body: '[]' },
    ),
  ],
};
const FLOW_SENT = [
  ...DEMO_SENT,
  [`${LONG_RULE_URL}&page=2`, 30 * SECOND, 46],
  [
    '/api/v2/organizations/acme/projects/checkout/members?role=owner&page=2',
    20 * SECOND,
    64,
  ],
];

// Runs in the page: sends each request once the one before has ended, as said above, then names
// the page.
async function send([requests, title]) {
  const fixed = Date.now;
  let ticks = 0;
  let step = 0;
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => (ticks += step),
  });
  const xhr = (url, { method, body }) =>
    new Promise((resolve) => {
      const request = new XMLHttpRequest();
      request.open(method, url);
      request.addEventListener('loadend', resolve);
      request.send(body);
    });
  for (const [url, ago, took, init] of requests) {
    Date.now = () => fixed.call(Date) - ago;
    step = took;
    try {
      if (init?.xhr) await xhr(url, init);
      else await (await fetch(url, init)).text();
    } catch {
      // A failed request is in the log too.
    }
  }
  Date.now = fixed;
  document.title = title;
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

// A browser with the extension, its rules stored, the clock at NOW, and the page with its traffic
// (named `title`), which every view watches. `scale`: its pixels to a CSS pixel. Its profile's
// folder goes with it, or as soon as it fails to start.
async function openShop(playwright, options) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-visual-'));
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, {
      // The Chromium `npm run browsers` installs, in its new headless mode, which (unlike the
      // headless shell) loads extensions.
      channel: 'chromium',
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        // The flows' browser draws without the GPU (SwiftShader): with it, Chromium drew a page
        // one of two ways from one run to the next, rounded edges a shade apart (Rosé Pine Dawn's
        // menu, 11 runs in 24), which a picture compared pixel for pixel sees; without it, 24 in
        // 24 the same. The views' browser keeps it, as their pictures were taken with it.
        ...(options.flows ? ['--disable-gpu'] : []),
      ],
      viewport: WIDE,
      deviceScaleFactor: options.scale,
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    return await fillShop(context, options, async () => {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    });
  } catch (error) {
    await context?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

// The rest of openShop(), in a browser that has started.
async function fillShop(context, { stored, sent, title, flows = false }, close) {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
  const id = new URL(worker.url()).host;
  // Extension APIs are bound a moment after the worker starts.
  for (
    let attempt = 0;
    attempt < 50 && !(await worker.evaluate(() => Boolean(globalThis.chrome?.storage)));
    attempt++
  )
    await sleep(100);
  await worker.evaluate((values) => chrome.storage.local.set(values), stored);
  // The flows' pages may use the clipboard, which Traffic's copy buttons write and the flows read;
  // and each keeps its root's Appearance as it was at its first frame (window.firstFrame), to show
  // that a page is drawn with it from the start. Before the clock is set, so it waits for a real
  // frame.
  if (flows) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.addInitScript(() =>
      requestAnimationFrame(() => {
        window.firstFrame = { ...document.documentElement.dataset };
      }),
    );
  }
  await context.clock.setFixedTime(NOW);
  const site = context.pages()[0] ?? (await context.newPage());
  await site.goto(`${ORIGIN}/__control?visual`);
  await site.evaluate(send, [sent, title]);
  // The last report on its way to the tab's log.
  await sleep(300);
  // `moved`: how far a flow has moved the clock on from NOW (moveClock()).
  return { context, id, worker, site, moved: 0, close };
}

// The parts the flows check, found as a user meets them. A row of a list that's a tree (the
// editor's rules, the popup's), by its name; a row's slot (the kit's Item), what it says and the
// actions that take its place; whether the focus on something shows its ring; the editor's sidebar
// footer, and the notice of a delete there.
export const item = (page, name) => page.getByRole('treeitem', { name, exact: true });
export const slot = (row) => row.locator('[data-slot="item-status"]').first();
export const slotActions = (row) =>
  row.locator('[data-slot="item-slot-actions"]').first();
export const ringed = (locator) =>
  locator.evaluate((element) => element.matches(':focus-visible'));
export const footer = (page) =>
  page.locator('footer').filter({ has: page.locator('[data-slot="undo-announcer"]') });
export const undoNotice = (page) => page.getByTestId('undo-notice');

// A rule's row in the editor's list: the first that has `name` in it.
export const row = (page, name) =>
  page.locator('[data-testid="rule"]', { hasText: name }).first();

// Opens the editor on a page of its own, `size` (WIDE or NARROW), on `view` ('rules' or
// 'traffic'), the rule named `rule` open, with a theme and Appearance's steps if given.
async function editorOn(shop, use) {
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
        .locator(view === 'traffic' ? '[data-testid="request"]' : '[data-testid="rule"]')
        .first()
        .waitFor();
      if (name) {
        await row(page, name).click();
        await page.locator('[data-testid="rule-name"]').waitFor();
      }
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.fonts.ready);
      return page;
    },
  );
  for (const page of opened) await page.close();
}

// Opens the popup as the toolbar would, beside the page with the traffic: in a tab behind it,
// which takes that page's tab as the one it's about. 330 wide; a shot of its <body> is its own
// height.
async function popupOn(shop, use) {
  const opened = [];
  // `keep`: with localStorage as the editor left it (Appearance picked there).
  await use(async ({ theme, appearance, keep = false } = {}) => {
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
    if (!keep) {
      await resetStorage(page, settings({ theme, appearance }));
      await page.reload();
    }
    await page.locator('[data-testid="popup-rule"]').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    return page;
  });
  for (const page of opened) await page.close();
}

// A flow starts from the same place as every other: the rules as stored, the clock at NOW.
async function resetFlow(shop) {
  shop.moved = 0;
  await shop.context.clock.setFixedTime(NOW);
  await shop.context.clock.resume();
  await shop.worker.evaluate(async (values) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(values);
  }, FLOW_STORED);
}

export const test = base.extend({
  // One test server for both browsers, on the port the pictures show, there before either.
  server: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's needs from this
    async ({}, use) => {
      const { server } = await startServer({ port: PORT });
      await use(server);
      server.close();
    },
    { scope: 'worker', auto: true },
  ],
  // The views' browser, set up once for the run (the suite runs in one worker).
  shop: [
    async ({ playwright }, use) => {
      const shop = await openShop(playwright, {
        scale: 1,
        stored: STORED,
        sent: SENT,
        title: 'Acme Shop',
      });
      await use(shop);
      await shop.close();
    },
    { scope: 'worker' },
  ],
  // The flows' browser, at 2x: the demo's rules and traffic.
  flowShop: [
    async ({ playwright }, use) => {
      const shop = await openShop(playwright, {
        scale: 2,
        stored: FLOW_STORED,
        sent: FLOW_SENT,
        title: 'Acme dashboard',
        flows: true,
      });
      await use(shop);
      await shop.close();
    },
    { scope: 'worker' },
  ],
  editor: async ({ shop }, use) => editorOn(shop, use),
  popup: async ({ shop }, use) => popupOn(shop, use),
  flowEditor: async ({ flowShop }, use) => {
    await resetFlow(flowShop);
    await editorOn(flowShop, use);
  },
  flowPopup: async ({ flowShop }, use) => {
    await resetFlow(flowShop);
    await popupOn(flowShop, use);
  },
});

// A state's picture, at the flows' 2x: the part of the page `what` covers (a locator or several,
// or a clip), `pad` CSS px wider on each side for a ring or a shadow drawn outside it; or, with
// `what` null, the whole window, where the layout is the point. At 2x too: scaled to 1x as it's
// taken, the same page came out a shade different after what it had been through (the Appearance
// flow's editor, as it came and with its defaults picked again), where at 2x it's the same.
// `name` is its area's folder and its own: ['rules', 'slot.png'] is
// baselines/<platform>/rules/slot.png.
export async function look(page, what, name, { pad = 4 } = {}) {
  await settle(page);
  if (!what) return expect(page).toHaveScreenshot(name, { scale: 'device' });
  // A clip of the page given as such ({ x, y, width, height }), where no element frames the state.
  const clip =
    typeof what.width === 'number' ? what : await around(page, [what].flat(), pad);
  return expect(page).toHaveScreenshot(name, { scale: 'device', clip });
}

// Waits until nothing moves but what moves for ever (the pulse, which a picture stops), so a part
// is measured, and its clip set, at rest: a toast still sliding in measured 8 px short, and the
// picture's own `animations: 'disabled'` then finished it inside a clip cut too soon. Asked from
// here rather than with the page's timers, which pauseClock() holds; then a few frames more.
async function settle(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === 'running' &&
                animation.effect?.getTiming().iterations !== Infinity,
            ).length,
      ),
    )
    .toBe(0);
  await sleep(50);
}

// A clip of the page around what `locators` cover, `pad` CSS px wider on each side, inside the
// window.
async function around(page, locators, pad = 8) {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));
  const size = page.viewportSize();
  const x = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.x)) - pad));
  const y = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.y)) - pad));
  const right = Math.min(
    size.width,
    Math.ceil(Math.max(...boxes.map((b) => b.x + b.width)) + pad),
  );
  const bottom = Math.min(
    size.height,
    Math.ceil(Math.max(...boxes.map((b) => b.y + b.height)) + pad),
  );
  return { x, y, width: right - x, height: bottom - y };
}

// Moves the flows' clock on by `ms`, as that time passing would: Date moves on (from where the
// flow has it), and each timer due meanwhile fires, once (an interval too, as a tab in the
// background has it). A shared clock (src/lib/clock.ts) ticks then, and draws the new time.
export async function moveClock(shop, ms) {
  shop.moved += ms;
  await shop.context.clock.setFixedTime(NOW + shop.moved);
  await shop.context.clock.fastForward(ms);
}

// Stops the flows' timers (animation frames too) until resumeClock(), so a state that lasts a
// second stays for its checks and its picture however long they take; moveClock() still fires
// what's due as it moves.
export const pauseClock = (shop) => shop.context.clock.pauseAt(NOW + shop.moved);
export const resumeClock = (shop) => shop.context.clock.resume();

// The menu open on `page` (from a ⋯, a right-click or a key), once it has taken focus, which it
// does a moment after its items show: keys pressed before then go to the page behind it.
export async function menuOpen(page) {
  const menu = page.getByRole('menu').first();
  await menu.waitFor();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(document.activeElement?.closest('[role="menu"]'))),
    )
    .toBe(true);
  return menu;
}

// Esc, and every menu gone. A flow waits for this before a right-click: one that lands outside
// the app's menus (on a menu's backdrop, say) gets the browser's own, which headless Chromium
// closes on.
export async function menuShut(page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

// The groups as stored, in their order.
export const storedGroups = (shop) =>
  shop.worker.evaluate(async () => (await chrome.storage.local.get('groups')).groups);

// A rule as stored, by its id.
export const storedRule = async (shop, id) =>
  (await storedRules(shop)).find((each) => each.id === id);

// The rules as stored.
export const storedRules = (shop) =>
  shop.worker.evaluate(async () => (await chrome.storage.local.get('rules')).rules);
