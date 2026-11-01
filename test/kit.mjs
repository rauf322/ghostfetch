// UI kit check: the kit page (src/pages/kit/, every component of src/shared/ui/kit/) under the
// extension pages' real CSP, in Chromium and in Zen. It fails on any CSP violation, uncaught
// error or console error, drives each component with the keyboard and the mouse, and checks the
// kit's icons against src/shared/lib/icons.ts. Two self-checks make sure a pass means something: a
// <style> tag added on purpose has to be caught, and so does Base UI's own when its CSPProvider
// setting is off (every page built on the kit keeps it on).
//
//   npm run test:kit      builds the kit page (wxt build --mode kit, both browsers), then runs this
//
// Set HEADED=1 to watch it, SHOTS=dir to save screenshots of the kit page, and FIREFOX=/path to use
// another Firefox build than Zen. Firefox's automation can't open extension pages, so Zen loads the
// kit build from http://127.0.0.1 instead, with the manifest's CSP sent as a response header: the
// browser enforces the same policy on the page.
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { launch } from 'puppeteer-core';
import { icon } from '../src/shared/lib/index.ts';
import { ROOT, check, expect, finish, requireBuild, sleep } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const FIREFOX = process.env.FIREFOX || '/Applications/Zen.app/Contents/MacOS/zen';
const SHOTS = process.env.SHOTS;
const KIT = {
  chrome: path.join(ROOT, '.output', 'chrome-mv3-kit'),
  firefox: path.join(ROOT, '.output', 'firefox-mv3-kit'),
};
const VIEWPORT = { width: 1280, height: 900 };

// The data-slot names each component file gives its parts; the kit page has to show at least one
// from every file, so a new component can't be left off it.
const UI = path.join(ROOT, 'src', 'shared', 'ui', 'kit');
const SLOTS = Object.fromEntries(
  fs
    .readdirSync(UI)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => {
      const source = fs.readFileSync(path.join(UI, file), 'utf8');
      return [
        file,
        [...source.matchAll(/data-slot="([\w-]+)"|slot: '([\w-]+)'/g)].map(
          (match) => match[1] ?? match[2],
        ),
      ];
    }),
);
// The icons as src/shared/lib/icons.ts draws them as HTML, for the body editor's find bar. The
// names come from its list of shapes, whose long ones oxfmt moves onto the line after the name.
const ICONS = Object.fromEntries(
  [
    ...fs
      .readFileSync(path.join(ROOT, 'src', 'shared', 'lib', 'icons.ts'), 'utf8')
      .matchAll(/^ {2}(\w+):\s*'/gm),
  ].map(([, name]) => [name, icon(name, 18)]),
);

// The few things the checks do with a page, written once for Playwright (Chromium) and Puppeteer
// (Zen), whose pages have these in common.
function driver(page, problems) {
  return {
    page,
    problems,
    run: (fn, arg) => page.evaluate(fn, arg),
    // Puppeteer only knows the space bar as " ", which Playwright takes too.
    press: (key) => page.keyboard.press(key === 'Space' ? ' ' : key),
    type: (text) => page.keyboard.type(text),
    click: (selector) => page.click(selector),
    focus: (selector) => page.focus(selector),
    resize: (size) =>
      page.setViewportSize ? page.setViewportSize(size) : page.setViewport(size),
    clickPoint: ({ x, y }) => page.mouse.click(x, y),
    async until(fn, arg, what) {
      for (let tries = 0; tries < 50; tries++) {
        if (await page.evaluate(fn, arg)) return;
        await sleep(100);
      }
      throw new Error(`timed out waiting for ${what}`);
    },
  };
}

// The text of [data-testid=...]; the focused element by its test id, or else its text.
const read = (kit, testid) =>
  kit.run(
    (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent.trim() ?? null,
    testid,
  );
const focused = (kit) =>
  kit.run(
    () =>
      document.activeElement?.dataset.testid ||
      document.activeElement?.textContent.trim() ||
      document.activeElement?.tagName,
  );
const ready = (kit) =>
  kit.until(() => document.body.dataset.ready === '1', undefined, 'the kit page');
// Waits for focus to reach an element matching `selector`, and fails if it doesn't. Base UI moves
// focus into a popup a frame or two after it opens, and back to its button after it closes.
const focusOn = (kit, selector) =>
  kit.until(
    (wanted) => Boolean(document.activeElement?.matches(wanted)),
    selector,
    `focus on ${selector}`,
  );
// Reads `fn` in the page until it gives `expected`, or fails with what it gave last: a popup or a
// tab panel that's leaving stays in the page for a frame or two.
async function settles(kit, fn, expected, label) {
  let last;
  for (let tries = 0; tries < 30; tries++) {
    last = await kit.run(fn);
    if (JSON.stringify(last) === JSON.stringify(expected)) return;
    await sleep(100);
  }
  expect(last, expected, label);
}
const popupOpen = (slot) => (kit) =>
  kit.until(
    (name) => Boolean(document.querySelector(`[data-slot=${name}][data-open]`)),
    slot,
    `the ${slot} to open`,
  );
const popupClosed = (slot) => (kit) =>
  kit.until(
    (name) => !document.querySelector(`[data-slot=${name}][data-open]`),
    slot,
    `the ${slot} to close`,
  );
const selectOpen = popupOpen('select-content');
const selectClosed = popupClosed('select-content');
const menuOpen = popupOpen('dropdown-menu-content');
const menuClosed = popupClosed('dropdown-menu-content');

// Every check, in one browser. `open(query)` loads kit.html with that query in a new page.
async function runChecks(browser, open) {
  const kit = await open('');
  await ready(kit);

  await check(
    `${browser}: the kit page shows every component of src/shared/ui/kit/, with no <style> tag`,
    async () => {
      const shown = await kit.run(() => [
        ...new Set(
          [...document.querySelectorAll('[data-slot]')].map(
            (element) => element.dataset.slot,
          ),
        ),
      ]);
      expect(
        Object.entries(SLOTS)
          .filter(([, slots]) => !slots.some((slot) => shown.includes(slot)))
          .map(([file]) => file),
        [],
        'not on the kit page',
      );
      expect(
        await kit.run(() => document.querySelectorAll('style').length),
        0,
        '<style> tags',
      );
    },
  );

  await check(`${browser}: button: Enter, Space and a click press it`, async () => {
    await kit.focus('[data-testid=kit-button]');
    await kit.press('Enter');
    await kit.press('Space');
    await kit.click('[data-testid=kit-button]');
    expect(await read(kit, 'kit-button-presses'), '3 presses');
  });

  await check(
    `${browser}: toggle: Space turns it off and on again, and aria-pressed says so`,
    async () => {
      const pressed = () =>
        kit.run(() =>
          document.querySelector('[data-testid=kit-toggle]').getAttribute('aria-pressed'),
        );
      const seen = [await pressed()];
      await kit.focus('[data-testid=kit-toggle]');
      await kit.press('Space');
      seen.push(await pressed());
      await kit.press('Space');
      seen.push(await pressed());
      expect(seen, ['true', 'false', 'true']);
    },
  );

  await check(
    `${browser}: switch: Space flips it, and so does a click on the words next to it`,
    async () => {
      const state = () =>
        kit.run(() => [
          document.querySelector('[data-testid=kit-switch]').getAttribute('aria-checked'),
          document.querySelector('[data-testid=kit-switch-words]').textContent,
        ]);
      const seen = [await state()];
      await kit.focus('[data-testid=kit-switch]');
      await kit.press('Space');
      seen.push(await state());
      await kit.click('[data-testid=kit-switch-words]');
      seen.push(await state());
      expect(seen, [
        ['true', 'Rule on'],
        ['false', 'Rule off'],
        ['true', 'Rule on'],
      ]);
    },
  );

  await check(
    `${browser}: a rule's switch pulses while on, in step with the others, and is still while paused or off`,
    async () => {
      // Each dot: whether it's on, and its animations, with when each counts from.
      const state = () =>
        ['off', 'on', 'paused'].map((name) => {
          const dot = document.querySelector(`[data-testid=kit-signal-${name}]`);
          return [
            dot.getAttribute('aria-checked'),
            dot.firstElementChild
              .getAnimations()
              .map((animation) => [animation.animationName, animation.startTime]),
          ];
        });
      const pulse = [['signal-pulse', 0]];
      await settles(
        kit,
        state,
        [
          ['false', []],
          ['true', pulse],
          ['true', []],
        ],
        'at first',
      );
      // Switched on a while after the others, it still pulses in step with them.
      await kit.click('[data-testid=kit-signal-off]');
      await settles(
        kit,
        state,
        [
          ['true', pulse],
          ['true', pulse],
          ['true', []],
        ],
        'switched on',
      );
      const everyPulse = await kit.run(() =>
        document
          .getAnimations()
          .filter((animation) => animation.animationName === 'signal-pulse')
          .map((animation) => animation.startTime),
      );
      if (everyPulse.length < 3 || everyPulse.some((start) => start !== 0))
        throw new Error(`pulses out of step: ${JSON.stringify(everyPulse)}`);
      await kit.click('[data-testid=kit-signal-off]');
      await settles(
        kit,
        state,
        [
          ['false', []],
          ['true', pulse],
          ['true', []],
        ],
        'switched off again',
      );
    },
  );

  await check(
    `${browser}: tabs: the arrow keys move between tabs, Enter opens one`,
    async () => {
      const state = () => ({
        focus: document.activeElement.textContent.trim(),
        selected: [
          ...document.querySelectorAll(
            '[data-testid=kit-tabs] [role=tab][aria-selected=true]',
          ),
        ].map((tab) => tab.textContent.trim()),
        panels: [...document.querySelectorAll('[data-testid=kit-tabs] [role=tabpanel]')]
          .filter((panel) => panel.getClientRects().length)
          .map((panel) => panel.textContent.trim()),
      });
      await kit.focus('[data-testid=kit-tabs] [role=tab]');
      await kit.press('ArrowRight');
      await settles(
        kit,
        state,
        { focus: 'Traffic 14', selected: ['Rules 08'], panels: ['The rule list.'] },
        'after the arrow',
      );
      await kit.press('Enter');
      await settles(
        kit,
        state,
        { focus: 'Traffic 14', selected: ['Traffic 14'], panels: ['The traffic log.'] },
        'after Enter',
      );
    },
  );

  await check(
    `${browser}: segmented: the arrow keys choose, and one option is always chosen`,
    async () => {
      const chosen = () =>
        kit.run(() =>
          [
            ...document.querySelectorAll(
              '[data-testid=kit-segmented] [role=radio][aria-checked=true]',
            ),
          ].map((radio) => radio.textContent),
        );
      const seen = [await chosen()];
      await kit.focus('[data-testid=kit-segmented] [role=radio][aria-checked=true]');
      await kit.press('ArrowRight');
      seen.push(await chosen());
      // A click on the chosen option leaves it chosen.
      await kit.click('[data-testid=kit-segmented] [role=radio][aria-checked=true]');
      seen.push(await chosen());
      await kit.press('ArrowLeft');
      seen.push(await chosen());
      expect(seen, [['Replace'], ["Server's body"], ["Server's body"], ['Replace']]);
    },
  );

  await check(
    `${browser}: toggle group: a click chooses a status code, a second click clears it, arrows move`,
    async () => {
      const seen = [await read(kit, 'kit-choices')];
      await kit.click('[data-testid=kit-chip-404]');
      seen.push(await read(kit, 'kit-choices'));
      await kit.click('[data-testid=kit-chip-200]');
      seen.push(await read(kit, 'kit-choices'));
      // Firefox on a Mac doesn't focus a button that's clicked, so focus it before the arrow.
      await kit.focus('[data-testid=kit-chip-200]');
      await kit.press('ArrowRight');
      await focusOn(kit, '[data-testid=kit-chip-201]');
      expect(seen, [
        'Replace · status 404',
        'Replace · status none',
        'Replace · status 200',
      ]);
    },
  );

  await check(`${browser}: input: typing changes its value`, async () => {
    await kit.focus('[data-testid=kit-input]');
    await kit.run(() => document.querySelector('[data-testid=kit-input]').select());
    await kit.type('/api/projects');
    expect(await read(kit, 'kit-input-value'), '/api/projects');
  });

  await check(
    `${browser}: select: Enter opens it on the chosen option, an arrow moves, Enter chooses, Esc closes; focus goes back to it`,
    async () => {
      await kit.focus('[data-testid=kit-select]');
      await kit.press('Enter');
      await selectOpen(kit);
      await focusOn(kit, '[data-testid=kit-select-GET]');
      // The chosen option is marked by the white square alone (Base UI would put a ✔️ in it).
      await settles(
        kit,
        () =>
          [
            ...document.querySelectorAll(
              '[data-slot=select-content][data-open] [data-slot=select-item-indicator]',
            ),
          ].map((mark) => mark.textContent),
        [''],
        "the chosen option's mark",
      );
      await kit.press('ArrowDown');
      await focusOn(kit, '[data-testid=kit-select-POST]');
      await kit.press('Enter');
      await selectClosed(kit);
      await focusOn(kit, '[data-testid=kit-select]');
      const chosen = await read(kit, 'kit-picked');
      await kit.press('Enter');
      await selectOpen(kit);
      await focusOn(kit, '[data-testid=kit-select-POST]');
      await kit.press('Escape');
      await selectClosed(kit);
      await focusOn(kit, '[data-testid=kit-select]');
      expect(
        [chosen, await read(kit, 'kit-picked')],
        ['POST · no menu item run yet', 'POST · no menu item run yet'],
      );
    },
  );

  await check(
    `${browser}: menu: Enter opens it on its first item, arrows move, Enter runs one, Esc closes; focus goes back to its button`,
    async () => {
      await kit.focus('[data-testid=kit-menu]');
      await kit.press('Enter');
      await menuOpen(kit);
      await focusOn(kit, '[role=menuitem]');
      const seen = [await focused(kit)];
      await kit.press('ArrowDown');
      await kit.press('ArrowDown');
      await focusOn(kit, '[data-testid=kit-menu-delete]');
      await kit.press('Enter');
      await menuClosed(kit);
      await focusOn(kit, '[data-testid=kit-menu]');
      seen.push(await read(kit, 'kit-picked'));
      await kit.click('[data-testid=kit-menu]');
      await menuOpen(kit);
      await kit.press('Escape');
      await menuClosed(kit);
      await focusOn(kit, '[data-testid=kit-menu]');
      expect(seen, ['Duplicate', 'POST · ran Delete']);
    },
  );

  await check(`${browser}: toast: one shows at a time, and its Undo runs`, async () => {
    const toasts = () =>
      kit.run(() =>
        [...document.querySelectorAll('[data-slot=toast]')]
          .filter((toast) => toast.textContent.includes('Checkout fails'))
          .map((toast) => (toast.getClientRects().length ? 'shown' : 'waiting')),
      );
    await kit.click('[data-testid=kit-toast-button]');
    await kit.click('[data-testid=kit-toast-button]');
    await kit.until(
      () =>
        [...document.querySelectorAll('[data-slot=toast]')].filter((toast) =>
          toast.textContent.includes('Checkout fails'),
        ).length === 2,
      undefined,
      'two toasts',
    );
    const two = (await toasts()).toSorted();
    // A real click on the Undo of the toast that shows.
    await kit.clickPoint(
      await kit.run(() => {
        const shown = [...document.querySelectorAll('[data-slot=toast]')].find(
          (toast) =>
            toast.textContent.includes('Checkout fails') && toast.getClientRects().length,
        );
        const box = [...shown.querySelectorAll('button')]
          .find((button) => button.textContent === 'Undo')
          .getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }),
    );
    expect(
      [two, await read(kit, 'kit-toast-undone')],
      [['shown', 'waiting'], 'undone 1 time'],
    );
  });

  await check(
    `${browser}: icons: the same shapes as src/shared/lib/icons.ts`,
    async () => {
      const differences = await kit.run((expected) => {
        const shown = Object.fromEntries(
          [...document.querySelectorAll('[data-testid=kit-icons] svg[data-icon]')].map(
            (svg) => [svg.dataset.icon, svg],
          ),
        );
        const parse = (markup) => {
          const holder = document.createElement('div');
          holder.innerHTML = markup;
          return holder.firstElementChild;
        };
        const drawing = (svg) =>
          JSON.stringify([
            ...[
              'viewBox',
              'fill',
              'stroke',
              'stroke-width',
              'stroke-linecap',
              'stroke-linejoin',
            ].map((name) => svg.getAttribute(name)),
            svg.innerHTML,
          ]);
        return [...new Set([...Object.keys(expected), ...Object.keys(shown)])].filter(
          (name) =>
            !expected[name] ||
            !shown[name] ||
            drawing(parse(expected[name])) !== drawing(shown[name]),
        );
      }, ICONS);
      expect(differences, []);
    },
  );

  await check(
    `${browser}: no CSP violations, uncaught errors or console errors after all of that`,
    async () => {
      expect([await kit.run(() => window.kitViolations), kit.problems], [[], []]);
    },
  );
  await kit.page.close();

  await check(
    `${browser}: the select and the menu held open: no CSP violations or errors`,
    async () => {
      const held = await open('?open');
      await ready(held);
      // As tall as the page, so the lists have room to open downwards, as they do in use.
      await held.resize({
        width: VIEWPORT.width,
        height: await held.run(() => document.documentElement.scrollHeight),
      });
      await sleep(400);
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await held.page.screenshot({
          path: path.join(SHOTS, `kit-${browser.toLowerCase()}.png`),
        });
      }
      const result = [
        await held.run(() => [
          document.querySelectorAll(
            '[data-slot=select-content][data-open], [data-slot=dropdown-menu-content][data-open]',
          ).length,
          window.kitViolations,
        ]),
        held.problems,
      ];
      await held.page.close();
      expect(result, [[2, []], []]);
    },
  );

  await check(
    `${browser}: self-check: a <style> tag added on purpose is blocked, and noticed`,
    async () => {
      const canary = await open('?canary');
      await ready(canary);
      const violations = await canary.run(() => window.kitViolations);
      await canary.page.close();
      expect(
        violations.some((violation) => violation.startsWith('style-src')),
        true,
        JSON.stringify(violations),
      );
    },
  );

  await check(
    `${browser}: self-check: with CSPProvider's setting off, Base UI's own <style> tag is blocked`,
    async () => {
      const off = await open('?csp=off');
      await ready(off);
      await off.click('[data-testid=kit-select]');
      await selectOpen(off);
      await sleep(200);
      const violations = await off.run(() => window.kitViolations);
      await off.page.close();
      expect(
        violations.some((violation) => violation.startsWith('style-src')),
        true,
        JSON.stringify(violations),
      );
    },
  );
}

// Chromium: the kit build installed as an extension, so the browser applies the manifest's CSP.
async function inChromium() {
  const dir = requireBuild(KIT.chrome);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-kit-'));
  const context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROME
      ? { executablePath: process.env.CHROME }
      : { channel: 'chromium' }),
    headless: !process.env.HEADED,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    viewport: VIEWPORT,
    // As with macOS's Reduce motion on, which Zen picks up from the system: a rule's switch
    // still pulses then.
    reducedMotion: 'reduce',
  });
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
    const origin = `chrome-extension://${new URL(worker.url()).host}`;
    console.log(
      `Chromium ${context.browser()?.version() ?? ''}, the kit page at ${origin}/kit.html`,
    );
    await runChecks('Chromium', async (query) => {
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
      page.on(
        'console',
        (message) =>
          message.type() === 'error' && problems.push(`console: ${message.text()}`),
      );
      await page.goto(`${origin}/kit.html${query}`);
      return driver(page, problems);
    });
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.json': 'application/json',
};

// Zen: the kit build served over http, with the manifest's CSP as a response header.
async function inZen() {
  const dir = requireBuild(KIT.firefox);
  const csp = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    .content_security_policy.extension_pages;
  const server = http.createServer((req, res) => {
    const file = path.join(
      dir,
      decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
    if (
      !file.startsWith(dir + path.sep) ||
      !fs.statSync(file, { throwIfNoEntry: false })?.isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'content-security-policy': csp,
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch({
    browser: 'firefox',
    executablePath: FIREFOX,
    headless: !process.env.HEADED,
  });
  try {
    console.log(
      `\n${await browser.version()}, the kit page at ${origin}/kit.html with the CSP as a header`,
    );
    await runChecks('Zen', async (query) => {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      const problems = [];
      page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
      page.on(
        'console',
        (message) =>
          message.type() === 'error' && problems.push(`console: ${message.text()}`),
      );
      await page.goto(`${origin}/kit.html${query}`);
      return driver(page, problems);
    });
  } finally {
    await browser.close();
    server.close();
  }
}

await inChromium();
await inZen();
finish();
