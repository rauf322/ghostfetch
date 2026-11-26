// The popup, walked as a user would (reports/t3-design-plan.md, 3b): this page's rules with what
// each did here and when, Edit under the pointer, the keys (↓ and its ring, Space turning a rule
// off and on), All rules with the rows that haven't answered stepping back, the fold of the rules
// not answering here, and the right-click menu inside the popup's 330 px. Each step is one state,
// checked as a user meets it, then pictured at 2x (baselines/<platform>/popup/).
import {
  expect,
  item,
  look,
  menuOpen,
  menuShut,
  ringed,
  slot,
  storedRule,
  test,
} from './extension.mjs';

const shot = (name) => ['popup', `${name}.png`];
const ruleRow = (page, id) =>
  page.locator(`[data-testid="popup-rule"][data-item="${id}"]`);

test('Popup: this page’s rules, Edit, the keys, All rules, the fold, and the right-click menu', async ({
  flowPopup,
  flowShop,
}) => {
  const page = await flowPopup();
  const rows = page.getByTestId('popup-rule');

  await test.step('This page: the four rules that answered here, each saying what it did and when', async () => {
    await expect(page.getByRole('radio', { name: /^This page/ })).toBeChecked();
    await expect(rows.locator('[data-slot="item-title"]')).toHaveText([
      'Pro plan user',
      'Slow search',
      'Feature flags',
      'Overdue invoices',
    ]);
    await expect(rows.locator('[data-slot="item-status"]')).toHaveText([
      '1 mocked · 4m',
      '2 modified · 12m',
      '1 mocked · 5m',
      '1 mocked · now',
    ]);
    await look(page, [rows.first(), rows.last()], shot('this-page'));
  });

  await test.step('Under the pointer, a row offers Edit where its slot was', async () => {
    const pro = item(page, 'Pro plan user');
    await pro.hover();
    const edit = pro.getByRole('button', { name: 'Edit this rule: “Pro plan user”' });
    await expect(edit).toBeVisible();
    await expect(edit).toHaveCSS('opacity', '1');
    await expect(slot(pro)).toHaveCSS('opacity', '0');
    await look(page, pro, shot('row-pointer'));
    await page.mouse.move(0, 0);
  });

  await test.step('↓ from the first row rings the next, Slow search', async () => {
    await item(page, 'Pro plan user').focus();
    await page.keyboard.press('ArrowDown');
    const search = item(page, 'Slow search');
    await expect(search).toBeFocused();
    expect(await ringed(search)).toBe(true);
    await look(page, search, shot('row-focus'));
  });

  await test.step('Space turns Slow search off: its dot goes out, and it’s stored off', async () => {
    await page.keyboard.press('Space');
    await expect
      .poll(async () => (await storedRule(flowShop, 'search')).enabled)
      .toBe(false);
    const search = ruleRow(page, 'search');
    await expect(search).toHaveAttribute('data-off', 'true');
    await expect(search).toBeFocused();
    await expect(search).toHaveAccessibleDescription(/^Off\./);
    await look(page, search, shot('row-turned-off'));
  });

  await test.step('Space again turns it back on, as it was', async () => {
    await page.keyboard.press('Space');
    await expect
      .poll(async () => (await storedRule(flowShop, 'search')).enabled)
      .toBe(true);
    const search = item(page, 'Slow search');
    await expect(search).not.toHaveAttribute('data-off');
    await expect(search).toBeFocused();
    await look(page, search, shot('row-focus'));
  });

  await test.step('All rules: every rule, the ones on that haven’t answered here stepping back', async () => {
    await page.getByRole('radio', { name: /^All rules/ }).click();
    await page.mouse.move(0, 0);
    const all = page.getByTestId('popup-rule');
    await expect(all.locator('[data-slot="item-title"]')).toHaveText([
      'Pro plan user',
      'Checkout fails',
      'Slow search',
      'Feature flags',
      'Empty project list',
      'Invoices (GraphQL)',
      'Overdue invoices',
    ]);
    await expect(
      ruleRow(page, 'checkout').locator('[data-slot="item-title"]'),
    ).toHaveAttribute('data-quiet', 'true');
    await expect(ruleRow(page, 'projects')).toHaveAttribute('data-off', 'true');
    // Longer than the popup: the window as a user meets it, the list scrolling in its card.
    await look(page, null, shot('all-rules'));
  });

  await test.step('This page again, and the fold of the rules not answering here, opened', async () => {
    await page.getByRole('radio', { name: /^This page/ }).click();
    const fold = item(page, 'Not answering here');
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(fold).toHaveAccessibleDescription('2 on · 1 off');
    await page.getByTestId('not-answering').click();
    await page.mouse.move(0, 0);
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(
      fold.getByTestId('popup-rule').locator('[data-slot="item-title"]'),
    ).toHaveText(['Checkout fails', 'Empty project list', 'Invoices (GraphQL)']);
    // Below the card's fold: scrolled to, as a user would.
    await fold.scrollIntoViewIfNeeded();
    await look(page, fold, shot('not-answering-open'));
  });

  await test.step('A right-click near the popup’s right edge: the row’s menu, inside its 330 px', async () => {
    const pro = item(page, 'Pro plan user');
    const box = await pro.boundingBox();
    // On the element, which Playwright scrolls to and checks the point lands on: a right-click
    // that missed the app's menus would get the browser's own, which headless Chromium closes on.
    await pro.click({ button: 'right', position: { x: box.width - 16, y: 16 } });
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText(['Edit this rule', 'Turn off']);
    const at = await menu.boundingBox();
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x + at.width).toBeLessThanOrEqual(330);
    await look(page, [ruleRow(page, 'pro'), menu], shot('menu'));
    await menuShut(page);
  });
});
