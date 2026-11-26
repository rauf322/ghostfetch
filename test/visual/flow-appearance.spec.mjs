// Appearance, walked as a user would (reports/t3-design-plan.md, 1a and 1b): the ⋯ menu's
// Appearance, each pick checked as it's made with the menu staying open and the page behind it
// changing at once, the row's detail naming the picks; then, after a reload and in a popup opened
// afterwards, drawn with them from the first frame (window.firstFrame, extension.mjs); and the
// defaults picked again, which bring back exactly the first pictures (the same baselines). Each step
// is one state, checked as a user meets it, then pictured at 2x, the menus or the whole window
// (baselines/<platform>/appearance/).
import { NARROW, expect, look, menuOpen, test } from './extension.mjs';

const shot = (name) => ['appearance', `${name}.png`];
const PICKS = [
  ['contrast', 'more', 'More'],
  ['font', 'mono', 'More, Commit Mono'],
  ['size', 'larger', 'More, Commit Mono, Larger'],
];
const DEFAULTS = [
  ['contrast', 'standard'],
  ['font', 'geist'],
  ['size', 'default'],
];

// How the page draws its words now: a grey line's colour, the body's font, a title's size.
const drawn = (page) =>
  page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      grey: style('[data-slot="item-description"]').color,
      font: style('body').fontFamily,
      size: style('[data-slot="item-title"]').fontSize,
    };
  });
const stored = (page) =>
  page.evaluate(() =>
    ['contrast', 'font', 'size'].map((name) =>
      localStorage.getItem(`ghostfetch.${name}`),
    ),
  );

// Opens a ⋯ menu (the footer's, or in a narrow window the top bar's) and its Appearance, which
// stays open beside it.
async function openAppearance(page, menu = 'sidebar-menu') {
  await page.getByTestId(menu).click();
  await menuOpen(page);
  await page.getByTestId('appearance-menu').click();
  const sub = page.getByRole('menu').last();
  await expect(page.getByRole('menu')).toHaveCount(2);
  await expect(sub.getByTestId('contrast-standard')).toBeVisible();
  return sub;
}
const menus = (page) => [
  page.getByTestId('appearance-menu'),
  page.getByRole('menu').last(),
];
// Appearance's detail, drawn whole: no part of it cut short (6b.7).
const detailWhole = (page) =>
  page
    .getByTestId('appearance-menu')
    .locator('[data-slot="dropdown-menu-detail"]')
    .evaluate((detail) => detail.scrollWidth <= detail.clientWidth);

test('Appearance: picked from the ⋯ menu, kept through a reload and in the popup, and undone', async ({
  flowEditor,
  flowPopup,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user' });
  let before;

  await test.step('The editor as it comes: Ghostfetch, Standard contrast, Geist, the default size', async () => {
    await expect(page.locator('html')).not.toHaveAttribute('data-contrast');
    await expect(page.locator('html')).not.toHaveAttribute('data-font');
    await expect(page.locator('html')).not.toHaveAttribute('data-size');
    expect(await stored(page)).toEqual([null, null, null]);
    before = await drawn(page);
    await look(page, null, shot('editor-default'));
  });

  await test.step('⋯, then Appearance: the defaults checked, and “Default” beside it', async () => {
    const sub = await openAppearance(page);
    for (const [setting, step] of DEFAULTS)
      await expect(sub.getByTestId(`${setting}-${step}`)).toHaveAttribute(
        'aria-checked',
        'true',
      );
    await expect(page.getByTestId('appearance-menu')).toContainText('Default');
    await page.getByTestId('appearance-menu').hover();
    await look(page, menus(page), shot('menu-default'));
  });

  for (const [setting, step, detail] of PICKS)
    await test.step(`${setting} ${step} picked: checked, the menu still open, the page changed at once, “${detail}” beside Appearance`, async () => {
      const sub = page.getByRole('menu').last();
      const was = await drawn(page);
      await sub.getByTestId(`${setting}-${step}`).click();
      await expect(sub.getByTestId(`${setting}-${step}`)).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(page.getByRole('menu')).toHaveCount(2);
      await expect(page.locator('html')).toHaveAttribute(`data-${setting}`, step);
      const now = await drawn(page);
      const changed = { contrast: 'grey', font: 'font', size: 'size' }[setting];
      expect(now[changed]).not.toBe(was[changed]);
      await expect(page.getByTestId('appearance-menu')).toContainText(detail);
      expect(await detailWhole(page)).toBe(true);
      await page.getByTestId('appearance-menu').hover();
      await look(page, menus(page), shot(`menu-${setting}-${step}`));
    });

  await test.step('Closed and reloaded: drawn with them from its first frame', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.reload();
    await page.getByRole('treeitem').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() => page.evaluate(() => window.firstFrame))
      .toMatchObject({ contrast: 'more', font: 'mono', size: 'larger' });
    expect(await stored(page)).toEqual(['more', 'mono', 'larger']);
    // A reload opens New rule: the rule opened again, as it was.
    await page.getByRole('treeitem', { name: 'Pro plan user', exact: true }).click();
    await expect(page.getByTestId('rule-name')).toHaveValue('Pro plan user');
    await page.mouse.move(0, 0);
    await look(page, null, shot('editor-picked'));
  });

  await test.step('A popup opened afterwards: drawn with them from its first frame too', async () => {
    const popup = await flowPopup({ keep: true });
    await expect
      .poll(() => popup.evaluate(() => window.firstFrame))
      .toMatchObject({ contrast: 'more', font: 'mono', size: 'larger' });
    // The site line keeps the host's port, the host cut in its middle; each view tab its label on
    // one line, its count giving way first (6b.6).
    const host = popup.getByTestId('site-line').locator('[data-slot="middle-truncate"]');
    await expect(host).toHaveAttribute('data-full', '127.0.0.1:47219');
    await expect(host.locator('[data-part="tail"]')).toHaveText(/:47219$/);
    // The port drawn inside the tail's box, whatever of the tail's start gives way.
    expect(
      await host.locator('[data-part="tail"]').evaluate((tail) => {
        const text = tail.firstChild.firstChild;
        const range = document.createRange();
        range.setStart(text, text.length - ':47219'.length);
        range.setEnd(text, text.length);
        const port = range.getBoundingClientRect();
        const box = tail.getBoundingClientRect();
        return port.left >= box.left - 0.5 && port.right <= box.right + 0.5;
      }),
    ).toBe(true);
    const lines = await popup
      .locator('[data-slot="segmented-item"]')
      .evaluateAll((tabs) =>
        tabs.map((tab) => {
          const range = document.createRange();
          range.selectNodeContents(tab.querySelector('[data-part="label"]'));
          return [
            tab.textContent,
            new Set([...range.getClientRects()].map((rect) => rect.top)).size,
          ];
        }),
      );
    expect(lines.map(([, count]) => count)).toEqual([1, 1, 1]);
    await look(popup, null, shot('popup-picked'));
    await popup.close();
  });

  await test.step('The defaults picked again: the menu as it was at first', async () => {
    await page.bringToFront();
    const sub = await openAppearance(page);
    for (const [setting, step] of DEFAULTS)
      await sub.getByTestId(`${setting}-${step}`).click();
    for (const [setting, step] of DEFAULTS)
      await expect(sub.getByTestId(`${setting}-${step}`)).toHaveAttribute(
        'aria-checked',
        'true',
      );
    await expect(page.getByTestId('appearance-menu')).toContainText('Default');
    expect(await stored(page)).toEqual([null, null, null]);
    expect(await drawn(page)).toEqual(before);
    await page.getByTestId('appearance-menu').hover();
    await look(page, menus(page), shot('menu-default'));
  });

  await test.step('Closed by a click beside them: the editor exactly as it came', async () => {
    // With the pointer, as it was opened: Esc would leave ⋯ ringed, which the editor as it came
    // isn't.
    await page.mouse.click(900, 700);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await look(page, null, shot('editor-default'));
  });
});

// In a side panel 420 px wide, at Most, Commit Mono and Larger, the editor's ⋯ menu (the top
// bar's, there) and its Appearance stay inside the window, the detail as whole as the room lets
// it be (6b.7).
test('Appearance: at Most, Commit Mono and Larger, the ⋯ menu stays inside a 420 px window', async ({
  flowEditor,
}) => {
  const page = await flowEditor({ size: NARROW });

  await test.step('Most, Commit Mono and Larger picked: both menus inside the window', async () => {
    const sub = await openAppearance(page, 'editor-menu');
    for (const [setting, step] of [
      ['contrast', 'most'],
      ['font', 'mono'],
      ['size', 'larger'],
    ])
      await sub.getByTestId(`${setting}-${step}`).click();
    await expect(page.getByTestId('appearance-menu')).toContainText(
      'Most, Commit Mono, Larger',
    );
    const width = page.viewportSize().width;
    const boxes = await page.getByRole('menu').evaluateAll((all) =>
      all.map((menu) => {
        const { left, right } = menu.getBoundingClientRect();
        return [Math.round(left), Math.round(right)];
      }),
    );
    expect(boxes).toHaveLength(2);
    for (const [left, right] of boxes) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(width);
    }
    await page.getByTestId('appearance-menu').hover();
    await look(page, null, shot('menus-420-most-mono-larger'));
  });
});
