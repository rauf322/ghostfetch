// The editor's views, each compared with its saved picture: wide with a rule open, and in a 420 px
// panel the list and an open rule; a row under the pointer, a focused row, the right-click menu,
// the ⋯ menu with Appearance open, a tooltip with its key; New rule; a body's Diff; Appearance at
// Commit Mono, Larger and Most; and the five themes other than Ghostfetch's, wide, a rule open as
// in the first (which is Ghostfetch's). The browser and the data: extension.mjs.
import { NARROW, expect, row, test } from './extension.mjs';

const RULE = 'Pro plan user';

test('the editor wide, a rule open', async ({ editor }) => {
  const page = await editor({ rule: RULE });
  await expect(page).toHaveScreenshot('editor-wide-rule.png');
});

test('in a 420 px panel: the list', async ({ editor }) => {
  const page = await editor({ size: NARROW });
  await expect(page).toHaveScreenshot('editor-narrow-list.png');
});

test('in a 420 px panel: an open rule', async ({ editor }) => {
  const page = await editor({ size: NARROW, rule: RULE });
  await expect(page).toHaveScreenshot('editor-narrow-rule.png');
});

test('a row under the pointer, with its actions', async ({ editor }) => {
  const page = await editor({ rule: RULE });
  await row(page, 'Feature flags').hover();
  await expect(page).toHaveScreenshot('editor-row-hover.png');
});

test('a focused row, by the keyboard', async ({ editor }) => {
  const page = await editor({ rule: RULE });
  // The open rule's row, then down the list by the keys, past the group's header to its first
  // rule: moved by a key, focus shows its ring.
  await row(page, RULE).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveScreenshot('editor-row-focus.png');
});

test("a row's right-click menu", async ({ editor }) => {
  const page = await editor({ rule: RULE });
  await row(page, 'Feature flags').click({
    button: 'right',
    position: { x: 120, y: 14 },
  });
  await page
    .locator('[data-slot="context-menu-content"] [role^="menuitem"]')
    .first()
    .waitFor();
  await expect(page).toHaveScreenshot('editor-context-menu.png');
});

test('the ⋯ menu with Appearance open', async ({ editor }) => {
  const page = await editor({ rule: RULE });
  await page.locator('[data-testid="sidebar-menu"]').click();
  await page.locator('[data-testid="appearance-menu"]').click();
  await page.locator('[data-slot="dropdown-menu-sub-content"]').waitFor();
  await expect(page).toHaveScreenshot('editor-menu-appearance.png');
});

test('a tooltip with its key', async ({ editor }) => {
  const page = await editor({ rule: RULE });
  // (Each view has one; Traffic's is hidden.)
  await page.locator('[data-testid="sidebar-toggle"]:visible').hover();
  await page.locator('[data-slot="tooltip"]').waitFor();
  await expect(page).toHaveScreenshot('editor-tooltip-key.png');
});

test('New rule', async ({ editor }) => {
  const page = await editor();
  await page.locator('[data-testid="new-rule"]').click();
  await page.locator('[data-testid="composer-input"]').waitFor();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('editor-new-rule.png');
});

test("a body's Diff with the server's response", async ({ editor }) => {
  const page = await editor({ rule: RULE });
  await page.locator('[data-testid="diff-switch"]').click();
  await page.locator('[data-testid="diff"]').waitFor();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('editor-diff.png');
});

test('Appearance at Commit Mono, Larger and Most', async ({ editor }) => {
  const page = await editor({
    rule: RULE,
    appearance: { font: 'mono', size: 'larger', contrast: 'most' },
  });
  await expect(page).toHaveScreenshot('editor-appearance.png');
});

// Ghostfetch's own is the default, editor-wide-rule.png.
for (const theme of [
  'rose-pine',
  'rose-pine-moon',
  'rose-pine-dawn',
  'catppuccin-macchiato',
  'vague',
]) {
  test(`the ${theme} theme, wide, a rule open`, async ({ editor }) => {
    const page = await editor({ rule: RULE, theme });
    await expect(page).toHaveScreenshot(`editor-theme-${theme}.png`);
  });
}
