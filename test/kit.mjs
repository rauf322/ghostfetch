// UI kit check: the kit page (src/app/kit/, every component of src/ui/kit/) under the
// extension pages' real CSP, in Chromium and in Zen. It fails on any CSP violation, uncaught
// error or console error, drives each component with the keyboard and the mouse, holds every
// theme's grey text to its floor at each step of Appearance's Contrast (src/app/styles/theme.css),
// and checks the kit's icons against src/lib/icons.ts. Two self-checks make sure a pass means
// something: a <style> tag added on purpose has to be caught, and so does Base UI's own when its
// CSPProvider setting is off (every page built on the kit keeps it on).
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
import { icon } from '../src/lib/index.ts';
import { APPEARANCE, THEMES } from '../src/ui/theme.ts';
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
const UI = path.join(ROOT, 'src', 'ui', 'kit');
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
// The icons as src/lib/icons.ts draws them as HTML, for the body editor's find bar. The
// names come from its list of shapes, whose long ones oxfmt moves onto the line after the name.
const ICONS = Object.fromEntries(
  [
    ...fs
      .readFileSync(path.join(ROOT, 'src', 'lib', 'icons.ts'), 'utf8')
      .matchAll(/^ {2}(\w+):\s*'/gm),
  ].map(([, name]) => [name, icon(name, 18)]),
);

// The description a screen reader gets of the element `selector` finds, '' for none: in Chromium,
// the browser's own, from its accessibility tree (`cdp`, a DevTools session on the page); in Zen,
// whose automation has no such tree, worked out as browsers do from its aria-describedby.
async function describedAs(page, cdp, selector) {
  if (!cdp)
    return page.evaluate(
      (wanted) =>
        (document.querySelector(wanted).getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent.trim() ?? '')
          .filter(Boolean)
          .join(' '),
      selector,
    );
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector,
  });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  });
  return nodes[0]?.description?.value ?? '';
}

// The name a screen reader gives the element `selector` finds: in Chromium, the browser's own;
// in Zen, worked out from the page as browsers do for a name made of its words: text that isn't
// aria-hidden, and what ::before and ::after add.
async function namedAs(page, cdp, selector) {
  if (!cdp)
    return page.evaluate((wanted) => {
      const added = (element, which) => {
        const content = getComputedStyle(element, which).content;
        return content.startsWith('"') ? JSON.parse(content) : '';
      };
      const words = (element) =>
        element.getAttribute('aria-hidden') === 'true'
          ? ''
          : added(element, '::before') +
            [...element.childNodes]
              .map((node) =>
                node.nodeType === Node.TEXT_NODE
                  ? node.textContent
                  : node.nodeType === Node.ELEMENT_NODE
                    ? words(node)
                    : '',
              )
              .join('') +
            added(element, '::after');
      return words(document.querySelector(wanted)).replace(/\s+/g, ' ').trim();
    }, selector);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector,
  });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  });
  return nodes[0]?.name?.value ?? '';
}

// The few things the checks do with a page, written once for Playwright (Chromium) and Puppeteer
// (Zen), whose pages have these in common.
function driver(page, problems, cdp) {
  return {
    page,
    problems,
    run: (fn, arg) => page.evaluate(fn, arg),
    // Puppeteer only knows the space bar as " ", which Playwright takes too, and no Shift+ keys.
    // Firefox's automation (WebDriver BiDi) has no ContextMenu key: in Zen the page gets it as key
    // events of its own, on what has focus.
    async press(key) {
      if (key === 'ContextMenu' && !cdp)
        return page.evaluate(() => {
          for (const type of ['keydown', 'keyup'])
            document.activeElement.dispatchEvent(
              new KeyboardEvent(type, {
                key: 'ContextMenu',
                bubbles: true,
                cancelable: true,
              }),
            );
        });
      if (!key.startsWith('Shift+'))
        return page.keyboard.press(key === 'Space' ? ' ' : key);
      await page.keyboard.down('Shift');
      await page.keyboard.press(key.slice('Shift+'.length));
      return page.keyboard.up('Shift');
    },
    description: (selector) => describedAs(page, cdp, selector),
    name: (selector) => namedAs(page, cdp, selector),
    // Copies what's selected, as a person does: ⌘C, or Ctrl+C off a Mac. Playwright (Chromium,
    // the page with a DevTools session) knows the key by that name; Puppeteer holds it down.
    async copy() {
      if (cdp) return page.keyboard.press('ControlOrMeta+C');
      const command = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.down(command);
      await page.keyboard.press('c');
      return page.keyboard.up(command);
    },
    // What's on the system clipboard (each browser is let read it: see inChromium(), inZen()).
    clipboard: () => page.evaluate(() => navigator.clipboard.readText()),
    type: (text) => page.keyboard.type(text),
    click: (selector) => page.click(selector),
    focus: (selector) => page.focus(selector),
    resize: (size) =>
      page.setViewportSize ? page.setViewportSize(size) : page.setViewport(size),
    clickPoint: ({ x, y }) => page.mouse.click(x, y),
    rightClick: ({ x, y }) => page.mouse.click(x, y, { button: 'right' }),
    pointTo: ({ x, y }) => page.mouse.move(x, y),
    // A touch screen with nothing that hovers, as DevTools' device mode has it, on or off: the
    // page's (any-hover: none) matches while it's on (Chromium alone).
    touch:
      cdp && ((on) => cdp.send('Emulation.setTouchEmulationEnabled', { enabled: on })),
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
const contextOpen = popupOpen('context-menu-content');
const contextClosed = popupClosed('context-menu-content');

// The tooltip open now, as [its lines (the label, then why the control is off), its key, its box
// as [left, top, right, bottom], the window's width and height], or null. `within` ms: the first
// one open in that time, or null.
async function tooltip(kit, within = 0) {
  const started = Date.now();
  for (;;) {
    const open = await kit.run(() => {
      const popup = document.querySelector('[data-slot=tooltip][data-open]');
      if (!popup) return null;
      const box = popup.getBoundingClientRect();
      return [
        [...popup.children].map((line) => line.firstChild.textContent),
        popup.querySelector('[data-slot=tooltip-keys]')?.textContent ?? null,
        [box.left, box.top, box.right, box.bottom].map(Math.round),
        document.documentElement.clientWidth,
        document.documentElement.clientHeight,
      ];
    });
    if (open || Date.now() - started >= within) return open;
    await sleep(20);
  }
}
// The middles of the kit's tooltip controls (data-testid kit-tooltip...), with their row scrolled
// to the middle of the window first.
const tooltipControls = (kit) =>
  kit.run(() => {
    document
      .querySelector('[data-testid=kit-tooltip-key]')
      .scrollIntoView({ block: 'center' });
    return Object.fromEntries(
      ['key', 'toggle', 'off', 'field'].map((name) => {
        const box = document
          .querySelector(
            `[data-testid=kit-tooltip${name === 'toggle' ? '' : `-${name}`}]`,
          )
          .getBoundingClientRect();
        return [
          name,
          { x: box.x + Math.min(box.width / 2, 40), y: box.y + box.height / 2 },
        ];
      }),
    );
  });
// Somewhere with no control, to move the pointer off one.
const NOWHERE = { x: 2, y: 2 };
// The middle of what `selector` finds, in the page.
const MIDDLE = (selector) => {
  const { x, y, width, height } = document
    .querySelector(selector)
    .getBoundingClientRect();
  return { x: x + width / 2, y: y + height / 2 };
};
// The kit's first rule row (Item; its slot says "2 mocked · 1 failed · 4m"), in the page: how
// opaque what its slot says and its actions are; where its name and its slot stand; each part of
// what the slot says, whole, cut, or out of sight; whether the slot ends inside the row's padding,
// nothing in the row overflowing it; and whether the name has 7 letters' room, or 60% of its line.
const KIT_RULE = '[data-testid=kit-rules] > li';
const SLOT_LOOK = () => {
  const row = document.querySelector('[data-testid=kit-rules] > li');
  const part = (slot) => row.querySelector(`[data-slot=${slot}]`);
  const box = (element) => {
    const { left, right, top, bottom } = element.getBoundingClientRect();
    return [left, right, top, bottom].map((edge) => Math.round(edge));
  };
  const status = part('item-status');
  const bottom = status.getBoundingClientRect().bottom;
  const title = part('item-title');
  const em = parseFloat(getComputedStyle(title).fontSize);
  const line = title.parentElement.getBoundingClientRect().width;
  const edge =
    row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
  return {
    status: getComputedStyle(status).opacity,
    actions: getComputedStyle(part('item-slot-actions')).opacity,
    name: box(title),
    slot: box(part('item-slot')),
    says: [...status.children].map((said) =>
      said.getBoundingClientRect().top >= bottom - 1
        ? 'gone'
        : said.scrollWidth > said.clientWidth
          ? 'cut'
          : 'whole',
    ),
    inside:
      part('item-slot').getBoundingClientRect().right <= edge + 0.5 &&
      row.scrollWidth <= row.clientWidth,
    room: title.getBoundingClientRect().width >= Math.min(7 * em, 0.6 * line) - 0.5,
  };
};
// SLOT_LOOK once `done` says so (an opacity takes 100 ms to change), or after 3 s.
async function slotLook(kit, done) {
  let look;
  for (let tries = 0; tries < 30; tries++) {
    look = await kit.run(SLOT_LOOK);
    if (done(look)) break;
    await sleep(100);
  }
  return look;
}
const atRest = (look) => look.status === '1' && look.actions === '0';
const actionsShown = (look) => look.status === '0' && look.actions === '1';
// The kit's first request row (Item; its slot says "200" over "3 ms"), in the page: how opaque
// what its slot says and its actions are; where its path and its slot stand; what its slot says,
// line by line, and whether its second line is under its first; whether its actions sit halfway
// down the row; and the icons of those of them that say they copied.
const KIT_REQUEST = '[data-testid=kit-requests] > li';
const REQUEST_LOOK = () => {
  const row = document.querySelector('[data-testid=kit-requests] > li');
  const part = (slot) => row.querySelector(`[data-slot=${slot}]`);
  const box = (element) => {
    const { left, right, top, bottom } = element.getBoundingClientRect();
    return [left, right, top, bottom].map((edge) => Math.round(edge));
  };
  const status = part('item-status');
  const lines = [...status.children];
  const actions = part('item-slot-actions').getBoundingClientRect();
  const own = row.getBoundingClientRect();
  return {
    status: getComputedStyle(status).opacity,
    actions: getComputedStyle(part('item-slot-actions')).opacity,
    path: box(row.querySelector('[data-full]')),
    slot: box(part('item-slot')),
    says: lines.map((line) => line.textContent),
    stacked:
      lines[1].getBoundingClientRect().top >=
      lines[0].getBoundingClientRect().bottom - 0.5,
    across:
      Math.abs((actions.top + actions.bottom) / 2 - (own.top + own.bottom) / 2) <= 1,
    copied: [...row.querySelectorAll('[data-copied]')].map(
      (control) => control.querySelector('[data-icon]').dataset.icon,
    ),
  };
};
// REQUEST_LOOK once `done` says so, or after 3 s.
async function requestLook(kit, done) {
  let look;
  for (let tries = 0; tries < 30; tries++) {
    look = await kit.run(REQUEST_LOOK);
    if (done(look)) break;
    await sleep(100);
  }
  return look;
}
// Focus in an open menu: on the menu itself (opened with a click) or on an item (with a key).
const INSIDE_MENU = '[role=menu], [role=menu] *';

// The grey levels that are text, brightest first, and the floor every theme holds them to on its
// page and on a card at each step of Appearance's Contrast (src/app/styles/theme.css): --t40 and
// --t30 at these contrasts or more, and each level at least `apart` times the contrast of the one
// below it. More and Most move every level toward the text, which brings them closer together:
// there a level only has to stay above the one below it.
const LEVELS = ['t80', 't65', 't50', 't40', 't30'];
const FLOORS = {
  standard: { t40: 4.5, t30: 3, apart: 1.15 },
  more: { t40: 5.5, t30: 4, apart: 1 },
  most: { t40: 6.5, t30: 5.5, apart: 1 },
};

// A computed colour as [red, green, blue, alpha], each from 0 to 1. It comes as rgb() or rgba(),
// in 0 to 255, or as color(srgb r g b / a), in 0 to 1, which is what color-mix() computes to.
function parseColour(text) {
  const match = /^(?:rgba?\((?<legacy>[^)]*)\)|color\(srgb (?<srgb>[^)]*)\))$/.exec(text);
  const channels = (match?.groups.legacy ?? match?.groups.srgb ?? '')
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (channels.length < 3 || channels.some((channel) => Number.isNaN(channel)))
    throw new Error(`a colour this check can't read: ${text}`);
  const [red, green, blue, alpha = 1] = channels;
  const scale = match.groups.legacy === undefined ? 1 : 255;
  return [red / scale, green / scale, blue / scale, alpha];
}
// A see-through colour over an opaque one, blended as the browser draws it.
const over = (top, under) => [
  ...top
    .slice(0, 3)
    .map((channel, index) => top[3] * channel + (1 - top[3]) * under[index]),
  1,
];
// WCAG 2's contrast between two opaque colours, from 1 to 21.
const luminance = (colour) =>
  colour
    .slice(0, 3)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (one, other) => {
  const [light, dark] = [luminance(one), luminance(other)].toSorted((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

// Every check, in one browser. `open(query)` loads kit.html with that query in a new page.
async function runChecks(browser, open) {
  const kit = await open('');
  await ready(kit);

  await check(
    `${browser}: the kit page shows every component of src/ui/kit/, with no <style> tag`,
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
    `${browser}: a rule's switch: a click and Space turn it on and off, and its dot pulses while it's on`,
    async () => {
      // What it says, and whether its dot pulses, a moment after each change.
      const state = async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return kit.run(() => {
          const control = document.querySelector('[data-testid=kit-rule-switch]');
          return [
            control.getAttribute('aria-checked'),
            control.firstElementChild
              .getAnimations()
              .some((animation) => animation.animationName === 'signal-pulse'),
          ];
        });
      };
      const seen = [await state()];
      await kit.click('[data-testid=kit-rule-switch]');
      seen.push(await state());
      await kit.focus('[data-testid=kit-rule-switch]');
      await kit.press('Space');
      seen.push(await state());
      expect(seen, [
        ['false', false],
        ['true', true],
        ['false', false],
      ]);
    },
  );

  await check(
    `${browser}: a signal dot pulses while on, in step with the others, fades in, and is still while paused or off`,
    async () => {
      // Each dot: whether it's on, and its animations, with when each counts from.
      const state = () =>
        ['off', 'on', 'paused'].map((name) => {
          const dot = document.querySelector(`[data-testid=kit-signal-${name}]`);
          return [
            dot.hasAttribute('data-on'),
            dot
              .getAnimations()
              .map((animation) => [animation.animationName, animation.startTime]),
          ];
        });
      const pulse = [['signal-pulse', 0]];
      await settles(
        kit,
        state,
        [
          [false, []],
          [true, pulse],
          [true, []],
        ],
        'at first',
      );
      // Whether the dot's grey-to-green fade is still running once its pulse has been put in
      // step: a listener on the document hears the pulse start after React's, at the root, has.
      await kit.run(() =>
        document.addEventListener('animationstart', (event) => {
          if (!event.target.closest('[data-testid=kit-signal-off]')) return;
          window.kitFadeRunning = event.target
            .getAnimations()
            .some(
              (animation) =>
                animation instanceof CSSTransition && animation.playState === 'running',
            );
        }),
      );
      // Lit a while after the others, it still pulses in step with them.
      await kit.click('[data-testid=kit-signal-light]');
      await settles(
        kit,
        state,
        [
          [true, pulse],
          [true, pulse],
          [true, []],
        ],
        'lit',
      );
      expect(await kit.run(() => window.kitFadeRunning), true, 'fading in as it pulses');
      const everyPulse = await kit.run(() =>
        document
          .getAnimations()
          .filter((animation) => animation.animationName === 'signal-pulse')
          .map((animation) => animation.startTime),
      );
      if (everyPulse.length < 3 || everyPulse.some((start) => start !== 0))
        throw new Error(`pulses out of step: ${JSON.stringify(everyPulse)}`);
      await kit.click('[data-testid=kit-signal-light]');
      await settles(
        kit,
        state,
        [
          [false, []],
          [true, pulse],
          [true, []],
        ],
        'put out again',
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
        { focus: 'Traffic 14', selected: ['Rules 8'], panels: ['The rule list.'] },
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

  await check(
    `${browser}: accordion: a click opens a row and closes the open one, Enter opens a row, Space closes it`,
    async () => {
      const seen = [await read(kit, 'kit-accordion-open')];
      await kit.click('[data-testid=kit-accordion-method]');
      seen.push(await read(kit, 'kit-accordion-open'));
      await kit.focus('[data-testid=kit-accordion-url]');
      await kit.press('Enter');
      seen.push(await read(kit, 'kit-accordion-open'));
      await kit.press('Space');
      seen.push(await read(kit, 'kit-accordion-open'));
      expect(seen, ['open: url', 'open: method', 'open: url', 'open: none']);
      // A closed row's editor leaves the page.
      await settles(
        kit,
        () => document.querySelectorAll('[data-slot=accordion-panel]').length,
        0,
        'no panel open',
      );
    },
  );

  await check(
    `${browser}: accordion: a split row's chevron opens a menu of its own, which a pick shuts, and the row's main part opens its editor as any row's does; Tab goes from one half to the other; the line between them shows only under the pointer or with focus`,
    async () => {
      const lineShows = () =>
        getComputedStyle(
          document.querySelector(
            '[data-testid=kit-accordion] [data-slot=accordion-split-line]',
          ),
        ).backgroundColor !== 'rgba(0, 0, 0, 0)';
      await kit.pointTo(NOWHERE);
      await settles(kit, lineShows, false, 'no line at rest');
      const row = await kit.run(() => {
        const box = document
          .querySelector('[data-testid=kit-accordion-status]')
          .getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      });
      await kit.pointTo(row);
      await settles(kit, lineShows, true, 'the line under the pointer');
      await kit.pointTo(NOWHERE);
      await settles(kit, lineShows, false, 'no line once the pointer has gone');
      await kit.focus('[data-testid=kit-accordion-status]');
      await kit.press('Tab');
      await focusOn(kit, '[data-testid=kit-accordion-codes]');
      await settles(kit, lineShows, true, 'the line with focus on the chevron');
      await kit.press('Enter');
      await menuOpen(kit);
      await kit.click('[data-testid=kit-code-404]');
      await menuClosed(kit);
      const picked = [
        await read(kit, 'kit-accordion-code'),
        await read(kit, 'kit-accordion-open'),
      ];
      await kit.click('[data-testid=kit-accordion-status]');
      const opened = await read(kit, 'kit-accordion-open');
      await kit.click('[data-testid=kit-accordion-status]');
      expect(
        [picked, opened, await read(kit, 'kit-accordion-open')],
        [['status: 404 Not Found', 'open: none'], 'open: status', 'open: none'],
      );
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
      // The chosen option is marked by the white dot alone (Base UI would put a ✔️ in it).
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

  await check(
    `${browser}: menu: the right arrow opens the Theme row's themes, Enter picks one and recolours the page with them still open, Esc closes them, then the menu`,
    async () => {
      const look = () =>
        kit.run(() => [
          document.documentElement.dataset.theme ?? '',
          getComputedStyle(document.body).backgroundColor,
        ]);
      const themesOpen = () =>
        kit.run(() =>
          Boolean(
            document.querySelector('[data-slot=dropdown-menu-sub-content][data-open]'),
          ),
        );
      await kit.focus('[data-testid=kit-menu]');
      await kit.press('Enter');
      await menuOpen(kit);
      await focusOn(kit, '[role=menuitem]');
      // Up from the first row, round to the last (Appearance), and one more: Theme.
      await kit.press('ArrowUp');
      await focusOn(kit, '[data-testid=appearance-menu]');
      await kit.press('ArrowUp');
      await focusOn(kit, '[data-testid=theme-menu]');
      await kit.press('ArrowRight');
      await focusOn(kit, '[data-testid=theme-ghostfetch]');
      await kit.press('ArrowDown');
      await focusOn(kit, '[data-testid=theme-rose-pine]');
      await kit.press('Enter');
      const seen = [await look(), await themesOpen()];
      await kit.press('Escape');
      await focusOn(kit, '[data-testid=theme-menu]');
      seen.push(await themesOpen());
      await kit.press('ArrowRight');
      await focusOn(kit, '[data-testid=theme-ghostfetch]');
      await kit.press('Enter');
      seen.push(await look());
      await kit.press('Escape');
      await focusOn(kit, '[data-testid=theme-menu]');
      await kit.press('Escape');
      await menuClosed(kit);
      await focusOn(kit, '[data-testid=kit-menu]');
      expect(seen, [
        ['rose-pine', 'rgb(25, 23, 36)'],
        true,
        false,
        ['', 'rgb(11, 11, 12)'],
      ]);
    },
  );

  await check(
    `${browser}: menu: the right arrow opens Appearance's Contrast, Font and Text size, each a group its label names; Enter picks a step, which restyles the page, is remembered and shows in the row, with them still open; the defaults picked again leave nothing behind`,
    async () => {
      // What's on <html> and stored for each setting, what the Appearance row says, and what the
      // page draws with: how far the grey levels are lifted, and the font and size of body text,
      // read from a probe with the type size the kit gives it (<body>'s own size isn't one:
      // Chrome sets it to 75% on extension pages, over the kit's).
      const look = () =>
        kit.run(() => {
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
            document.querySelector('[data-testid=appearance-menu] > span').textContent,
            getComputedStyle(root).getPropertyValue('--lift').trim(),
            ...drawn,
          ];
        });
      // Moves to a step with the arrow key, `times` over, and picks it.
      const pick = async (key, times, testid) => {
        for (let time = 0; time < times; time++) await kit.press(key);
        await focusOn(kit, `[data-testid=${testid}]`);
        await kit.press('Enter');
      };
      await kit.focus('[data-testid=kit-menu]');
      await kit.press('Enter');
      await menuOpen(kit);
      await focusOn(kit, '[role=menuitem]');
      // Up from the first row, round to the last: Appearance.
      await kit.press('ArrowUp');
      await focusOn(kit, '[data-testid=appearance-menu]');
      await kit.press('ArrowRight');
      await focusOn(kit, '[data-testid=contrast-standard]');
      const groups = await kit.run(() =>
        [
          ...document.querySelectorAll(
            '[data-slot=dropdown-menu-sub-content][data-open] [role=group]',
          ),
        ].map(
          (group) =>
            document.getElementById(group.getAttribute('aria-labelledby'))?.textContent,
        ),
      );
      // Down through the groups: Most, Commit Mono, Larger.
      await pick('ArrowDown', 2, 'contrast-most');
      await pick('ArrowDown', 2, 'font-mono');
      await pick('ArrowDown', 3, 'size-larger');
      const picked = await look();
      // And up again: Default, Geist, Standard.
      await pick('ArrowUp', 2, 'size-default');
      await pick('ArrowUp', 2, 'font-geist');
      await pick('ArrowUp', 3, 'contrast-standard');
      const back = await look();
      await kit.press('Escape');
      await focusOn(kit, '[data-testid=appearance-menu]');
      await kit.press('Escape');
      await menuClosed(kit);
      await focusOn(kit, '[data-testid=kit-menu]');
      expect(
        [groups, picked, back],
        [
          ['Contrast', 'Font', 'Text size'],
          [
            ['most', 'mono', 'larger'],
            ['most', 'mono', 'larger'],
            'Most, Commit Mono, Larger',
            '60%',
            'Commit Mono',
            '16.5px',
          ],
          [['', '', ''], [null, null, null], 'Default', '0%', 'Geist', '13px'],
        ],
      );
    },
  );

  await check(
    `${browser}: every theme's grey text reads at each contrast, on the page and on a card: --t40 and --t30 at 4.5:1 and 3:1 or more at Standard, 5.5:1 and 4:1 at More, 6.5:1 and 5.5:1 at Most, and each level above the one below (by 1.15× at Standard)`,
    async () => {
      // Each theme the stylesheets have (as test/e2e.mjs finds them for the selection colour),
      // put on <html> in turn at each step of Contrast, and the computed colours of its levels,
      // its page and its cards, read through a probe's background (a custom property's own value
      // isn't resolved).
      const steps = APPEARANCE.contrast.steps.map((step) => step.id);
      const colours = await kit.run(
        ([names, contrasts]) => {
          const rules = (list) =>
            [...list].flatMap((rule) => [
              rule,
              ...(rule.cssRules ? rules(rule.cssRules) : []),
            ]);
          const themes = new Set(
            [...document.styleSheets]
              .flatMap((sheet) => rules(sheet.cssRules))
              .flatMap((rule) => [
                ...(rule.selectorText ?? '').matchAll(
                  /\[data-theme=['"]?([\w-]+)['"]?\]/g,
                ),
              ])
              .map((match) => match[1]),
          );
          const root = document.documentElement;
          const probe = document.createElement('div');
          document.body.append(probe);
          const found = {};
          try {
            for (const theme of themes) {
              root.dataset.theme = theme;
              found[theme] = {};
              for (const [index, step] of contrasts.entries()) {
                // The first step is the default, which puts no attribute.
                if (index) root.dataset.contrast = step;
                else delete root.dataset.contrast;
                found[theme][step] = Object.fromEntries(
                  names.map((name) => {
                    probe.style.backgroundColor = `var(--${name})`;
                    return [name, getComputedStyle(probe).backgroundColor];
                  }),
                );
              }
            }
          } finally {
            // Ghostfetch's own at Standard again: no attributes, as src/ui/theme.ts leaves them.
            probe.remove();
            delete root.dataset.theme;
            delete root.dataset.contrast;
          }
          return found;
        },
        [[...LEVELS, 'bg', 'panel'], steps],
      );
      expect(
        [Object.keys(colours).toSorted(), steps.filter((step) => !FLOORS[step])],
        [THEMES.map((theme) => theme.id).toSorted(), []],
        'the themes the stylesheets have, and the contrast steps with no floor here',
      );
      const faint = [];
      for (const [theme, byStep] of Object.entries(colours))
        for (const [step, colour] of Object.entries(byStep))
          for (const [surface, name] of [
            ['the page', 'bg'],
            ['a card', 'panel'],
          ]) {
            const floor = FLOORS[step];
            const under = parseColour(colour[name]);
            const ratio = Object.fromEntries(
              LEVELS.map((level) => [
                level,
                contrast(over(parseColour(colour[level]), under), under),
              ]),
            );
            const reads = (level) => `--${level} ${ratio[level].toFixed(2)}:1`;
            const at = `${theme} at ${step}, on ${surface}`;
            for (const level of ['t40', 't30'])
              if (ratio[level] < floor[level])
                faint.push(`${at}: ${reads(level)}, under ${floor[level]}:1`);
            for (const [index, level] of LEVELS.slice(0, -1).entries()) {
              const below = LEVELS[index + 1];
              if (
                !(
                  ratio[level] > ratio[below] &&
                  ratio[level] >= floor.apart * ratio[below]
                )
              )
                faint.push(
                  `${at}: ${reads(level)}, ${floor.apart > 1 ? `under ${floor.apart}×` : 'not above'} ${reads(below)}`,
                );
            }
          }
      expect(faint, [], 'too faint');
    },
  );

  await check(`${browser}: toast: two show together, and an Undo runs`, async () => {
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
    // A real click on the Undo of the first of them.
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
      [['shown', 'shown'], 'undone 1 time'],
    );
  });

  await check(
    `${browser}: tooltip: the pointer resting on a control opens its tooltip, with its key, and moving to the next opens that one at once; Tab opens one; a control that's off says why; in a 330 px window the popup's pause button's stays inside, under it`,
    async () => {
      const at = await tooltipControls(kit);
      await kit.pointTo(NOWHERE);
      await sleep(500);
      await kit.pointTo(at.key);
      // Not at once: the pointer has to rest on it a moment (TOOLTIP_DELAY in tooltip.tsx).
      const passing = await tooltip(kit);
      const rested = (await tooltip(kit, 2000))?.slice(0, 2);
      await kit.pointTo(at.toggle);
      const next = (await tooltip(kit, 150))?.[0];
      await kit.pointTo(at.off);
      const off = (await tooltip(kit, 150))?.[0];
      await kit.pointTo(NOWHERE);
      await settles(
        kit,
        () => !document.querySelector('[data-slot=tooltip]'),
        true,
        'closed',
      );
      // Tab from the key's button: to Keep on reload, then to the control that's off.
      await kit.focus('[data-testid=kit-tooltip-key]');
      await kit.press('Tab');
      const tabbed = [(await tooltip(kit, 150))?.[0]];
      await kit.press('Tab');
      tabbed.push((await tooltip(kit, 150))?.[0]);
      await kit.press('Escape');
      await kit.run(() => document.activeElement.blur());
      // The pause button at the top right corner of a window as wide as the popup. The pointer
      // comes to it once the page is still: while it scrolls, the pointer opens no tooltip.
      await kit.resize({ width: 330, height: 600 });
      const button = await kit.run(() => {
        const pause = document.querySelector('[data-testid=kit-tooltip-edge]');
        pause.scrollIntoView({ block: 'start', inline: 'end' });
        const box = pause.getBoundingClientRect();
        return [box.x + box.width / 2, box.y + box.height / 2, box.right, box.bottom];
      });
      await sleep(500);
      await kit.pointTo({ x: button[0], y: button[1] });
      const [, , [left, top, right, bottom], width, height] = await tooltip(kit, 2000);
      await kit.pointTo(NOWHERE);
      await kit.resize(VIEWPORT);
      await kit.run(() => window.scrollTo(0, 0));
      const mod = await kit.run(() =>
        /Mac/.test(navigator.userAgent) ? '⌘B' : 'Ctrl+B',
      );
      expect(
        [
          passing,
          rested,
          next,
          off,
          tabbed,
          [left >= 0, right <= width, top >= button[3], bottom <= height],
          [button[2] > width - 30, width],
        ],
        [
          null,
          [['Hide the sidebar'], mod],
          ['Keep requests when the page reloads'],
          ['Turn on Agent access', "Paste your agent's pairing code first"],
          [
            ['Keep requests when the page reloads'],
            ['Turn on Agent access', "Paste your agent's pairing code first"],
          ],
          [true, true, true, true],
          [true, 330],
        ],
        `the tooltip at ${[left, top, right, bottom]} in ${width}×${height}`,
      );
    },
  );

  await check(
    `${browser}: tooltip: a click alone opens none, not even a field's (which a click gives :focus-visible); a click on its control closes one, and so does a scroll, unless the keyboard put it there; while the page scrolls, a control passing under the pointer opens none`,
    async () => {
      const at = await tooltipControls(kit);
      const wait = () => sleep(800);
      await kit.pointTo(NOWHERE);
      await sleep(500);
      await kit.clickPoint(at.key);
      await wait();
      const clicked = await tooltip(kit);
      await kit.pointTo(NOWHERE);
      await kit.clickPoint(at.field);
      await wait();
      const field = [
        await tooltip(kit),
        await kit.run(() => [
          document.activeElement.dataset.testid,
          document.activeElement.matches(':focus-visible'),
        ]),
      ];
      await kit.run(() => document.activeElement.blur());
      await kit.pointTo(NOWHERE);
      await sleep(500);
      // Rested on, then clicked: it closes, and stays closed under the pointer.
      await kit.pointTo(at.key);
      const before = (await tooltip(kit, 2000))?.[0];
      await kit.clickPoint(at.key);
      await wait();
      const closed = await tooltip(kit);
      await kit.pointTo(NOWHERE);
      await sleep(500);
      // Rested on, then the page scrolls a pixel, the pointer still on the control.
      await kit.pointTo(at.key);
      const shown = (await tooltip(kit, 2000))?.[0];
      await kit.run(() => window.scrollBy(0, 1));
      await sleep(300);
      const scrolled = await tooltip(kit);
      await kit.pointTo(NOWHERE);
      // Put there by Tab, it stays through the same scroll.
      await kit.focus('[data-testid=kit-tooltip-key]');
      await kit.press('Tab');
      const tabbed = (await tooltip(kit, 150))?.[0];
      await kit.run(() => window.scrollBy(0, -1));
      await sleep(300);
      const kept = (await tooltip(kit))?.[0];
      await kit.press('Escape');
      await kit.run(() => document.activeElement.blur());
      // Rested on, then the page scrolls under the still pointer in small steps, until the field
      // below is under it: any tooltip that opens meanwhile, but the one that was open. Chromium
      // tells the field the pointer came while the page still moves (Zen once it's still).
      const again = await tooltipControls(kit);
      await kit.pointTo(NOWHERE);
      await sleep(500);
      await kit.pointTo(again.key);
      const resting = (await tooltip(kit, 2000))?.[0];
      const flashed = await kit.run(async () => {
        const middle = (testid) => {
          const box = document
            .querySelector(`[data-testid=${testid}]`)
            .getBoundingClientRect();
          return box.y + box.height / 2;
        };
        const down = middle('kit-tooltip-field') - middle('kit-tooltip-key');
        const opened = new Set();
        const watch = new MutationObserver(() => {
          for (const popup of document.querySelectorAll('[data-slot=tooltip][data-open]'))
            opened.add(popup.firstChild.firstChild.textContent);
        });
        watch.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['data-open'],
        });
        for (let step = 0; step < 12; step++) {
          window.scrollBy(0, down / 12);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        watch.disconnect();
        return [...opened].filter((label) => label !== 'Hide the sidebar');
      });
      await kit.pointTo(NOWHERE);
      expect(
        [clicked, field, before, closed, shown, scrolled, tabbed, kept, resting, flashed],
        [
          null,
          [null, ['kit-tooltip-field', true]],
          ['Hide the sidebar'],
          null,
          ['Hide the sidebar'],
          null,
          ['Keep requests when the page reloads'],
          ['Keep requests when the page reloads'],
          ['Hide the sidebar'],
          [],
        ],
      );
    },
  );

  await check(
    `${browser}: tooltip: with every tooltip shut, a screen reader gets its words as its control's description, a key in words, after a description the control has of its own; none where the words are the control's name`,
    async () => {
      await kit.pointTo(NOWHERE);
      await kit.run(() => document.activeElement?.blur());
      await settles(
        kit,
        () => !document.querySelector('[data-slot=tooltip]'),
        true,
        'shut',
      );
      const heard = {};
      for (const [control, selector] of Object.entries({
        // Named "Keep on reload".
        words: '[data-testid=kit-tooltip]',
        // The ⋯, named "More", as its tooltip says.
        name: '[data-testid=kit-menu-slots]',
        // Named "Hide the sidebar", as its tooltip says, with ⌘B.
        key: '[data-testid=kit-tooltip-key]',
        // With aria-describedby of its own.
        own: '[data-testid=kit-tooltip-field]',
        off: '[data-slot=tooltip-reason]',
      }))
        heard[control] = await kit.description(selector);
      const linked = await kit.run(() =>
        document
          .querySelector('[data-testid=kit-menu-slots]')
          .hasAttribute('aria-describedby'),
      );
      const key = await kit.run(() =>
        /Mac/.test(navigator.userAgent) ? 'Command B' : 'Control B',
      );
      expect(
        [heard, linked],
        [
          {
            words: 'Keep requests when the page reloads',
            name: '',
            key,
            own: 'Narrows the list as you type. Search by URL, method, status or rule name',
            off: "Turn on Agent access. Paste your agent's pairing code first",
          },
          false,
        ],
      );
    },
  );

  await check(
    `${browser}: tooltip: the ⋯ menu opened from the keyboard and shut with Esc gives its button focus back with no tooltip, which shows once focus leaves and comes back; shut with Esc after a click, none while the pointer stays, and one once it leaves and comes back`,
    async () => {
      // The labels of the tooltips open now.
      const labels = () =>
        [...document.querySelectorAll('[data-slot=tooltip][data-open]')].map(
          (popup) => popup.firstChild.firstChild.textContent,
        );
      const showing = () => kit.run(labels);
      const shows = (label) => settles(kit, labels, [label], `${label}'s tooltip`);
      await kit.pointTo(NOWHERE);
      await sleep(500);
      // From the field before it.
      await kit.focus('[data-testid=kit-tooltip-field]');
      await kit.press('Tab');
      await focusOn(kit, '[data-testid=kit-menu-slots]');
      await shows('More');
      await kit.press('Enter');
      await menuOpen(kit);
      // Esc once focus is in the menu, which then gives it back: before, Esc reaches the button.
      await focusOn(kit, INSIDE_MENU);
      await kit.press('Escape');
      await menuClosed(kit);
      await focusOn(kit, '[data-testid=kit-menu-slots]');
      await sleep(800);
      const keyboard = await showing();
      await kit.press('Tab');
      await kit.press('Shift+Tab');
      await focusOn(kit, '[data-testid=kit-menu-slots]');
      await shows('More');
      await kit.press('Escape');
      await kit.run(() => document.activeElement.blur());
      // With the pointer: a click opens the menu, Esc shuts it.
      const at = await kit.run(() => {
        const box = document
          .querySelector('[data-testid=kit-menu-slots]')
          .getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
      await kit.pointTo(NOWHERE);
      await sleep(500);
      await kit.clickPoint(at);
      await menuOpen(kit);
      await focusOn(kit, INSIDE_MENU);
      await kit.press('Escape');
      await menuClosed(kit);
      await sleep(800);
      const staying = await showing();
      await kit.pointTo({ x: at.x + 3, y: at.y + 2 });
      await sleep(800);
      const moved = await showing();
      await kit.pointTo(NOWHERE);
      await sleep(200);
      await kit.pointTo(at);
      await shows('More');
      await kit.pointTo(NOWHERE);
      await kit.run(() => document.activeElement.blur());
      expect([keyboard, staying, moved], [[], [], []]);
    },
  );

  await check(
    `${browser}: URL cut in the middle: in a narrow box a long one keeps its end whole after its head's ellipsis; a short one is whole; one shorter than an end has no head; in less room than its end, the end gives way at its start, its last characters in sight inside its box; each copies as the text it is, in one piece; a screen reader names it once, whole`,
    async () => {
      const boxes = await kit.run(() =>
        Object.fromEntries(
          ['long', 'short', 'bare', 'tight'].map((name) => {
            const element = document.querySelector(`[data-testid=kit-middle-${name}]`);
            const head = element.querySelector('[data-part=head]');
            const tail = element.querySelector('[data-part=tail]');
            const cut = (part) => part.scrollWidth > part.clientWidth;
            const box = element.parentElement;
            const inside =
              box.getBoundingClientRect().right -
              parseFloat(getComputedStyle(box).paddingRight);
            // Where the tail's first and last characters are drawn, against the tail's box: its
            // last one in sight, and its first cut only where the tail gives way.
            const text = tail.firstChild.firstChild;
            const drawn = (at) => {
              const range = document.createRange();
              range.setStart(text, at);
              range.setEnd(text, at + 1);
              return range.getBoundingClientRect();
            };
            const edges = tail.getBoundingClientRect();
            return [
              name,
              [
                head && [cut(head), getComputedStyle(head).textOverflow],
                [tail.textContent, cut(tail)],
                [
                  drawn(text.length - 1).right <= edges.right + 0.5,
                  drawn(0).left < edges.left - 0.5,
                ],
                edges.right <= inside + 0.5,
              ],
            ];
          }),
        ),
      );
      // Each selected whole, as a drag across it does, and copied.
      const copied = [];
      for (const name of ['long', 'short', 'button']) {
        await kit.run((id) => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector(`[data-testid=${id}]`));
          getSelection().removeAllRanges();
          getSelection().addRange(range);
        }, `kit-middle-${name}`);
        await kit.copy();
        copied.push(await kit.clipboard());
      }
      await kit.run(() => getSelection().removeAllRanges());
      expect(
        [boxes, copied, await kit.name('[data-testid=kit-middle-button]')],
        [
          {
            long: [[true, 'ellipsis'], ['created_at', false], [true, false], true],
            short: [[false, 'ellipsis'], ['/search?q=inv', false], [true, false], true],
            bare: [null, ['/graphql', false], [true, false], true],
            tight: [[true, 'ellipsis'], ['created_at', true], [true, true], true],
          },
          [
            '/api/search?q=invoices&page=2&sort=-created_at',
            '/api/search?q=inv',
            '/graphql GetInvoices',
          ],
          '/graphql GetInvoices',
        ],
      );
    },
  );

  await check(
    `${browser}: copy button: a press copies, and for a second it says "Copied" with a check in the signal's colour, as wide as before and named as before, a polite live region saying "Copied the URL" once, then nothing; pressed again it starts the second over; Enter copies and it keeps the focus; a refused copy shows the error toast and leaves it as it was`,
    async () => {
      const button = '[data-testid=kit-copy]';
      // The button: whether it says Copied, its width, whether its check is drawn in the signal's
      // colour, and its live region (the element after it): what it says, and in how many pieces.
      const state = () =>
        kit.run((selector) => {
          const element = document.querySelector(selector);
          const live = element.nextElementSibling;
          const probe = document.createElement('span');
          probe.className = 'text-signal';
          document.body.append(probe);
          const signal = getComputedStyle(probe).color;
          probe.remove();
          const rest = element.querySelector('[data-part=words]');
          const copied = element.querySelector('[data-part=copied]');
          return [
            element.hasAttribute('data-copied'),
            Math.round(element.getBoundingClientRect().width),
            getComputedStyle(copied).opacity === '1' &&
              getComputedStyle(rest).opacity === '0',
            getComputedStyle(copied.querySelector('svg')).color === signal,
            live.getAttribute('aria-live'),
            live.textContent,
            live.children.length,
          ];
        }, button);
      const toasts = () =>
        kit.run(() =>
          [...document.querySelectorAll('[data-slot=toast]')]
            .map((toast) => toast.textContent)
            .filter((text) => /cop(y|ied)/i.test(text)),
        );
      await kit.pointTo(NOWHERE);
      const before = await state();
      await kit.click(button);
      await kit.until(
        (selector) => document.querySelector(selector).hasAttribute('data-copied'),
        button,
        'Copied',
      );
      const pressed = [await state(), await kit.clipboard(), await kit.name(button)];
      // Pressed again 0.6 s in: still Copied 1.35 s after the first press, then not.
      await sleep(600);
      await kit.click(button);
      await sleep(750);
      const again = (await state())[0];
      await kit.until(
        (selector) => !document.querySelector(selector).hasAttribute('data-copied'),
        button,
        'the words back',
      );
      const after = await state();
      // From the keyboard: Enter, and it keeps the focus.
      await kit.focus(button);
      await kit.press('Enter');
      await kit.until(
        (selector) => document.querySelector(selector).hasAttribute('data-copied'),
        button,
        'Copied by Enter',
      );
      const keyboard = await kit.run(
        (selector) => document.activeElement === document.querySelector(selector),
        button,
      );
      await kit.until(
        (selector) => !document.querySelector(selector).hasAttribute('data-copied'),
        button,
        'the words back',
      );
      // Refused, as the browser does in Firefox's sidebar without the focus.
      await kit.run(() => {
        navigator.clipboard.writeText = () =>
          Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'));
      });
      await kit.click(button);
      await kit.until(
        () =>
          [...document.querySelectorAll('[data-slot=toast]')].some((toast) =>
            toast.textContent.includes("Couldn't copy the URL"),
          ),
        undefined,
        'the error toast',
      );
      const refused = [await state(), await toasts()];
      await kit.run(() => delete navigator.clipboard.writeText);
      await kit.run(() => document.activeElement.blur());
      const width = before[1];
      expect(
        [before, pressed, again, after, keyboard, refused],
        [
          [false, width, false, true, 'polite', '', 0],
          [
            [true, width, true, true, 'polite', 'Copied the URL', 1],
            'https://app.acme.test/api/search?q=invoices&page=2',
            'Copy URL',
          ],
          true,
          [false, width, false, true, 'polite', '', 0],
          true,
          [
            [false, width, false, true, 'polite', '', 0],
            [
              "Couldn't copy the URLThe browser didn't let Ghostfetch use the clipboard. Click in Ghostfetch, then copy again.",
            ],
          ],
        ],
      );
    },
  );

  await check(
    `${browser}: item: a rule row's slot says what the rule did and when; under the pointer, with keyboard focus in the row, and while its ⋯ menu is open, the row's actions are there instead, and nothing in the row moves`,
    async () => {
      await kit.run(() =>
        document
          .querySelector('[data-testid=kit-rules]')
          .scrollIntoView({ block: 'center' }),
      );
      await kit.pointTo(NOWHERE);
      const rest = await slotLook(kit, atRest);
      await kit.pointTo(await kit.run(MIDDLE, KIT_RULE));
      const hovered = await slotLook(kit, actionsShown);
      await kit.pointTo(NOWHERE);
      const left = await slotLook(kit, atRest);
      // Tab from the row's dot to its first action.
      await kit.focus(`${KIT_RULE} [data-slot=switch]`);
      await kit.press('Tab');
      const focusedOn = await kit.run(() =>
        document.activeElement?.getAttribute('aria-label'),
      );
      const keyed = await slotLook(kit, actionsShown);
      await kit.run(() => document.activeElement.blur());
      const blurred = await slotLook(kit, atRest);
      // Its ⋯ clicked, and the pointer gone from the row while the menu is open.
      await kit.pointTo(await kit.run(MIDDLE, KIT_RULE));
      await slotLook(kit, actionsShown);
      await kit.clickPoint(await kit.run(MIDDLE, `${KIT_RULE} [aria-haspopup=menu]`));
      await menuOpen(kit);
      await kit.pointTo(NOWHERE);
      await sleep(300);
      const menu = await kit.run(SLOT_LOOK);
      // Esc gives focus back to the ⋯, from the keyboard, so they stay; with focus gone, they go.
      await kit.press('Escape');
      await menuClosed(kit);
      await focusOn(kit, `${KIT_RULE} [aria-haspopup=menu]`);
      const back = await slotLook(kit, actionsShown);
      await kit.run(() => document.activeElement.blur());
      const shut = await slotLook(kit, atRest);
      const parts = (look) => [look.status, look.actions, look.name, look.slot];
      const RESTING = ['1', '0', rest.name, rest.slot];
      const SHOWN = ['0', '1', rest.name, rest.slot];
      expect(
        [
          rest.says,
          parts(rest),
          parts(hovered),
          parts(left),
          focusedOn,
          parts(keyed),
          parts(blurred),
          parts(menu),
          parts(back),
          parts(shut),
        ],
        [
          ['whole', 'whole'],
          RESTING,
          SHOWN,
          RESTING,
          'Turn off “Logged-in admin user”',
          SHOWN,
          RESTING,
          SHOWN,
          SHOWN,
          RESTING,
        ],
      );
    },
  );

  await check(
    `${browser}: item: short of room, what a rule row's slot says gives way, its time going out of sight first, then its count cut, as the name keeps 7 letters' room and nothing reaches past the row's edge`,
    async () => {
      // The list from 420 px down to 220 px, 10 px at a time (the editor's sidebar is 260 px at
      // the least): what the slot says at each width, and whether the row held at each.
      const says = [];
      const held = [];
      try {
        for (let width = 420; width >= 220; width -= 10) {
          await kit.run((wanted) => {
            document.querySelector('[data-testid=kit-rules]').style.width = `${wanted}px`;
          }, width);
          const look = await kit.run(SLOT_LOOK);
          says.push(`${look.says}`);
          held.push(look.inside && look.room);
        }
      } finally {
        await kit.run(() => {
          document.querySelector('[data-testid=kit-rules]').style.width = '';
        });
      }
      expect(
        [says.filter((said, index) => said !== says[index - 1]), held.every(Boolean)],
        [['whole,whole', 'whole,gone', 'cut,gone'], true],
        says.join(' | '),
      );
    },
  );

  // Where nothing can hover (DevTools' touch emulation; Chromium alone has it).
  if (kit.touch)
    await check(
      `${browser}: item: where nothing can hover, a rule row has no actions and its slot keeps no room for them; under the pointer it still says what the rule did`,
      async () => {
        // The second rule's slot (it says nothing: room for the actions alone), and the first's
        // under the pointer.
        const looks = () =>
          kit.run(() => {
            const rows = document.querySelectorAll('[data-testid=kit-rules] > li');
            const part = (row, slot) => rows[row].querySelector(`[data-slot=${slot}]`);
            return [
              matchMedia('(any-hover: none)').matches,
              Math.round(part(1, 'item-slot').getBoundingClientRect().width),
              getComputedStyle(part(0, 'item-status')).opacity,
              getComputedStyle(part(0, 'item-slot-actions')).display,
            ];
          });
        // Under the pointer, the pointer moved there again for the page to see it there.
        const pointed = async () => {
          await kit.pointTo(NOWHERE);
          await kit.pointTo(await kit.run(MIDDLE, KIT_RULE));
          await sleep(300);
          return looks();
        };
        try {
          await kit.touch(true);
          const touch = await pointed();
          await kit.touch(false);
          const hover = await pointed();
          expect(
            [touch, hover],
            [
              [true, 0, '1', 'none'],
              [false, 48, '0', 'flex'],
            ],
          );
        } finally {
          await kit.touch(false);
          await kit.pointTo(NOWHERE);
        }
      },
    );

  await check(
    `${browser}: item: a request row's slot says its status over how long it took; under the pointer, while the row's right-click menu is open, and for the second one of its copies says it copied (its icon a check), the pointer gone, its actions are there instead, halfway down the row, and nothing in the row moves`,
    async () => {
      await kit.run(() =>
        document
          .querySelector('[data-testid=kit-requests]')
          .scrollIntoView({ block: 'center' }),
      );
      await kit.pointTo(NOWHERE);
      const rest = await requestLook(kit, atRest);
      await kit.pointTo(await kit.run(MIDDLE, KIT_REQUEST));
      const hovered = await requestLook(kit, actionsShown);
      // Copy URL pressed, and the pointer gone at once.
      await kit.clickPoint(
        await kit.run(MIDDLE, `${KIT_REQUEST} [aria-label="Copy URL"]`),
      );
      await kit.pointTo(NOWHERE);
      const copying = await requestLook(kit, (look) => look.copied.length > 0);
      const copied = await kit.clipboard();
      const after = await requestLook(kit, (look) => atRest(look) && !look.copied.length);
      // Its right-click menu, the pointer gone from the row while it's open.
      await kit.rightClick(await kit.run(MIDDLE, KIT_REQUEST));
      await contextOpen(kit);
      await kit.pointTo(NOWHERE);
      await sleep(300);
      const menu = await kit.run(REQUEST_LOOK);
      await kit.press('Escape');
      await contextClosed(kit);
      const shut = await requestLook(kit, atRest);
      const parts = (look) => [look.status, look.actions, look.path, look.slot];
      const RESTING = ['1', '0', rest.path, rest.slot];
      const SHOWN = ['0', '1', rest.path, rest.slot];
      expect(
        [
          [rest.says, rest.stacked, rest.across],
          parts(rest),
          parts(hovered),
          [...parts(copying), copying.copied],
          copied,
          parts(after),
          parts(menu),
          parts(shut),
        ],
        [
          [['200', '3 ms'], true, true],
          RESTING,
          SHOWN,
          [...SHOWN, ['check']],
          'https://localhost:3000/api/user',
          RESTING,
          SHOWN,
          RESTING,
        ],
      );
    },
  );

  await check(
    `${browser}: shared tooltip: the rule rows' dots share one tooltip, which says each one's words under the pointer; the two that say the same are described by one hidden copy of the words, the third by another, and a screen reader gets each its words`,
    async () => {
      const dot = (n) => `${KIT_RULE}:nth-child(${n}) [data-slot=switch]`;
      await kit.run(() =>
        document
          .querySelector('[data-testid=kit-rules]')
          .scrollIntoView({ block: 'center' }),
      );
      // Each dot's copies (aria-describedby), and how many copies of each set of words there are.
      const copies = await kit.run(() => {
        const ids = [
          ...document.querySelectorAll('[data-testid=kit-rules] > li [data-slot=switch]'),
        ].map((each) =>
          (each.getAttribute('aria-describedby') ?? '')
            .split(/\s+/)
            .filter((id) => id.startsWith('tooltip-words-')),
        );
        const texts = [
          ...document.querySelectorAll('[data-slot=tooltip-description]'),
        ].map((copy) => copy.textContent);
        return [
          ids.map((each) => each.length),
          ids[0][0] === ids[1][0],
          ids[0][0] !== ids[2][0],
          ['On. Click to turn this rule off', 'Off. Click to turn this rule on'].map(
            (words) => texts.filter((text) => text === words).length,
          ),
        ];
      });
      const described = [await kit.description(dot(1)), await kit.description(dot(3))];
      // Under the pointer, the first dot's words, then the third's, in the one popup.
      await kit.pointTo(NOWHERE);
      await kit.pointTo(await kit.run(MIDDLE, dot(1)));
      const first = await tooltip(kit, 3000);
      await kit.pointTo(await kit.run(MIDDLE, dot(3)));
      await sleep(400);
      const third = await tooltip(kit, 3000);
      const popups = await kit.run(
        () => document.querySelectorAll('[data-slot=tooltip][data-open]').length,
      );
      await kit.pointTo(NOWHERE);
      expect(
        [copies, described, first?.[0][0], third?.[0][0], popups],
        [
          [[1, 1, 1], true, true, [1, 1]],
          ['On. Click to turn this rule off', 'Off. Click to turn this rule on'],
          'On. Click to turn this rule off',
          'Off. Click to turn this rule on',
          1,
        ],
      );
    },
  );

  await check(
    `${browser}: right-click menu: on a rule row it opens at the pointer, and Esc shuts it; the ContextMenu key and Shift+F10 on the row with focus open it at the row's bottom left, Esc giving the row focus back; its items work; a right-click in the search field over the rows, or on text selected in one, gets the browser's own menu; a row Tab reaches has a ring inside its edge`,
    async () => {
      const row = (n) => `${KIT_RULE}:nth-child(${n})`;
      await kit.run(() => {
        document
          .querySelector('[data-testid=kit-rules]')
          .scrollIntoView({ block: 'center' });
        // Whether each right-click's event was kept from the browser, once it's been handled.
        window.kitMenus = [];
        addEventListener(
          'contextmenu',
          (event) => setTimeout(() => window.kitMenus.push(event.defaultPrevented)),
          true,
        );
      });
      // The open menu's top left, or null.
      const where = () =>
        kit.run(() => {
          const popup = document.querySelector(
            '[data-slot=context-menu-content][data-open]',
          );
          if (!popup) return null;
          const { left, top } = popup.getBoundingClientRect();
          return [left, top];
        });
      const near = (a, b) =>
        Boolean(a && b) && Math.hypot(a[0] - b[0], a[1] - b[1]) <= 12;
      const corner = (selector) =>
        kit.run((wanted) => {
          const { left, bottom } = document.querySelector(wanted).getBoundingClientRect();
          return [left, bottom];
        }, selector);
      const menus = () => kit.run(() => window.kitMenus.length);
      // A row Tab reaches from the search field, and the row after it: their rings.
      await kit.focus('[data-testid=kit-rules-search]');
      await kit.press('Tab');
      const rings = await kit.run(() =>
        [1, 2].map(
          (n) =>
            getComputedStyle(
              document.querySelector(`[data-testid=kit-rules] > li:nth-child(${n})`),
            ).boxShadow !== 'none',
        ),
      );
      // The pointer's right-click on the second row.
      const point = await kit.run(MIDDLE, row(2));
      await kit.rightClick(point);
      await contextOpen(kit);
      const byPointer = near(await where(), [point.x, point.y]);
      await kit.press('Escape');
      await contextClosed(kit);
      // The keys on the first row, focused.
      await kit.focus(row(1));
      await kit.press('ContextMenu');
      await contextOpen(kit);
      const byKey = near(await where(), await corner(row(1)));
      await kit.press('Escape');
      await contextClosed(kit);
      await focusOn(kit, row(1));
      await kit.press('Shift+F10');
      await contextOpen(kit);
      const byShiftF10 = near(await where(), await corner(row(1)));
      await kit.press('Escape');
      await contextClosed(kit);
      // Its item: Turn on, in the third row's menu, then Turn off again.
      const third = () =>
        kit.run(() =>
          document
            .querySelector('[data-testid=kit-rules] > li:nth-child(3) [data-slot=switch]')
            .getAttribute('aria-checked'),
        );
      const turned = [];
      for (let time = 0; time < 2; time++) {
        await kit.rightClick(await kit.run(MIDDLE, row(3)));
        await contextOpen(kit);
        await kit.click('[data-testid=kit-row-menu-turn]');
        await contextClosed(kit);
        turned.push(await third());
      }
      // The search field, then text selected in the second row: no menu of ours, and nothing kept
      // from the browser.
      const mine = await menus();
      await kit.rightClick(await kit.run(MIDDLE, '[data-testid=kit-rules-search]'));
      await sleep(300);
      const inField = await where();
      await kit.press('Escape');
      await kit.run(() =>
        getSelection().selectAllChildren(
          document.querySelector(
            '[data-testid=kit-rules] > li:nth-child(2) [data-slot=item-title]',
          ),
        ),
      );
      await kit.rightClick(await kit.run(MIDDLE, `${row(2)} [data-slot=item-title]`));
      await sleep(300);
      const onSelection = await where();
      await kit.press('Escape');
      await kit.run(() => getSelection().removeAllRanges());
      const kept = await kit.run((from) => window.kitMenus.slice(from), mine);
      expect(
        [rings, byPointer, byKey, byShiftF10, turned, inField, onSelection, kept],
        [[true, false], true, true, true, ['true', 'false'], null, null, [false, false]],
      );
    },
  );

  await check(`${browser}: icons: the same shapes as src/lib/icons.ts`, async () => {
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
  });

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
    // As with macOS's Reduce motion on, which Zen picks up from the system: the signal dot
    // still pulses then (T3 Code's dot, which it follows, doesn't).
    reducedMotion: 'reduce',
  });
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
    const origin = `chrome-extension://${new URL(worker.url()).host}`;
    // For the copy check to read what was copied. Chromium grants no permission to an
    // extension's origin by name ("opaque"), so to every page.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
      return driver(page, problems, await context.newCDPSession(page));
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
    // For the copy check to read what was copied: Firefox's own switches for tests, which let a
    // page read the clipboard without a person pasting.
    extraPrefsFirefox: {
      'dom.events.asyncClipboard.readText': true,
      'dom.events.testing.asyncClipboard': true,
    },
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
