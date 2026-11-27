// The rule list, walked as a user would (reports/t3-design-plan.md, 3a and 7a): what a row says
// and when it steps back, its actions under the pointer, with focus and while its menu is open, the
// time moving on; a group's header, as variant A has it, turned off and on from its slot and its
// menu; a long name in the narrowest window and the largest type; the list's keys; its right-click
// menus. Each step is one state: checked as a user meets it (role and name, focus,
// what the list holds, what's stored), then pictured, the part it's about at 2x
// (baselines/<platform>/rules/). The data is the demo's (extension.mjs, DEMO_STORED).
import {
  NARROW,
  WIDE,
  expect,
  item,
  look,
  menuOpen,
  menuShut,
  moveClock,
  ringed,
  slot,
  slotActions,
  storedRule,
  test,
} from './extension.mjs';

const shot = (name) => ['rules', `${name}.png`];
// Rows by their ids, for while a menu is open: it hides the page behind it from the accessibility
// tree, where item() finds them.
const ruleRow = (page, id) => page.locator(`[data-testid="rule"][data-item="${id}"]`);
const groupBlock = (page, id) =>
  page.locator(`[data-testid="group-block"][data-item="${id}"]`);
// Whether a part of a row's slot is in sight: on its one line, not wrapped below it, where the
// slot hides what has given way.
async function inSight(row, testId) {
  const status = await slot(row).boundingBox();
  const part = await row.getByTestId(testId).boundingBox();
  return part.y + part.height <= status.y + status.height + 0.5;
}

test('Rule list: a row at rest, stepping back, off, a minute on, and as the pointer, focus and its menu come', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Feature flags' });
  const pro = item(page, 'Pro plan user');

  await test.step('At rest, Pro plan user says what it did on the page and when: 1 mocked · 4m', async () => {
    await expect(slot(pro)).toHaveText('1 mocked · 4m');
    await expect(pro).toHaveAccessibleDescription('1 mocked · 4m GET /api/user Replace');
    await expect(slotActions(pro)).toHaveCSS('opacity', '0');
    await look(page, pro, shot('row-at-rest'));
  });

  await test.step('Checkout fails is on but hasn’t answered here, so it steps back; Slow search has', async () => {
    const checkout = item(page, 'Checkout fails');
    await expect(checkout.locator('[data-slot="item-title"]')).toHaveAttribute(
      'data-quiet',
      'true',
    );
    await expect(slot(checkout)).toHaveText('');
    const search = item(page, 'Slow search');
    await expect(slot(search)).toHaveText('2 modified · 12m');
    await expect(search.locator('[data-slot="item-title"]')).not.toHaveAttribute(
      'data-quiet',
    );
    await look(page, item(page, 'PR 412 · checkout'), shot('group-steps-back'));
  });

  await test.step('Empty project list is off: its dot, its faded row, and “Off.” for a screen reader', async () => {
    const off = item(page, 'Empty project list');
    await expect(off).toHaveAttribute('data-off', 'true');
    await expect(
      off.getByRole('switch', { name: 'Turn “Empty project list” on or off' }),
    ).not.toBeChecked();
    await expect(off).toHaveAccessibleDescription(/^Off\./);
    expect((await storedRule(flowShop, 'projects')).enabled).toBe(false);
    await look(page, off, shot('row-off'));
  });

  await test.step('Billing GraphQL is off, and its rule with it, though the rule itself is on: “Off” at its header’s end, and to a screen reader', async () => {
    const billing = item(page, 'Billing GraphQL');
    await expect(slot(billing)).toHaveText('Off');
    await expect(billing).toHaveAccessibleDescription('Off.');
    await expect(billing.getByTestId('group')).toHaveAttribute('data-off', 'true');
    const invoices = item(page, 'Invoices (GraphQL)');
    await expect(invoices).toHaveAttribute('data-group-off', '');
    await expect(invoices).toHaveAccessibleDescription(
      /^Off, as its group Billing GraphQL is off\./,
    );
    expect((await storedRule(flowShop, 'invoices')).enabled).toBe(true);
    await look(page, billing, shot('group-off'));
  });

  await test.step('A minute on, the clock’s next tick says 5m', async () => {
    await moveClock(flowShop, 60_000);
    await expect(slot(pro)).toHaveText('1 mocked · 5m');
    await look(page, pro, shot('row-a-minute-on'));
  });

  await test.step('Under the pointer, the slot gives way to its actions: Turn off, and ⋯', async () => {
    await pro.hover();
    await expect(slotActions(pro)).toHaveCSS('opacity', '1');
    await expect(slot(pro)).toHaveCSS('opacity', '0');
    await expect(
      pro.getByRole('button', { name: 'Turn off “Pro plan user”' }),
    ).toBeVisible();
    await expect(
      pro.getByRole('button', { name: 'More actions for “Pro plan user”' }),
    ).toBeVisible();
    await look(page, pro, shot('row-pointer'));
  });

  await test.step('With focus from the keyboard, its ring, and the same actions', async () => {
    await page.mouse.move(0, 0);
    await item(page, 'Feature flags').focus();
    await page.keyboard.press('Home');
    await expect(pro).toBeFocused();
    expect(await ringed(pro)).toBe(true);
    await expect(slotActions(pro)).toHaveCSS('opacity', '1');
    await look(page, pro, shot('row-focus'));
  });

  await test.step('While its ⋯ menu is open, the actions stay, with the pointer on the menu; Open and Rename first, with their keys', async () => {
    await pro.hover();
    await pro.getByRole('button', { name: 'More actions for “Pro plan user”' }).click();
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Open ↵',
      'Rename F2',
      'Duplicate',
      'Move to group',
      'Export this rule',
      'Delete',
    ]);
    await menu.getByRole('menuitem', { name: 'Export this rule' }).hover();
    await expect(slotActions(ruleRow(page, 'pro'))).toHaveCSS('opacity', '1');
    await look(page, [ruleRow(page, 'pro'), menu], shot('row-menu-open'));
    await menuShut(page);
  });
});

// A group as stored, by its id.
const storedGroup = async (shop, id) =>
  (
    await shop.worker.evaluate(
      async () => (await chrome.storage.local.get('groups')).groups,
    )
  ).find((each) => each.id === id);

test('Rule list: a group’s header, as A has it: its chip and its count, Turn the group off and ⋯ under the pointer, off and on again', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Feature flags' });
  const group = item(page, 'PR 412 · checkout');
  const header = groupBlock(page, 'pr-412').getByTestId('group');

  await test.step('At rest: the chevron, its chip PR, its name, and how many rules it has, 2', async () => {
    await expect(header.locator('[data-slot="monogram"]')).toHaveAttribute(
      'data-letters',
      'PR',
    );
    await expect(slot(group)).toHaveText('2');
    await expect(group).toHaveAccessibleDescription('2 rules.');
    await expect(slotActions(group)).toHaveCSS('opacity', '0');
  });

  await test.step('Under the pointer, the slot gives way to Turn the group off and ⋯', async () => {
    await header.hover();
    await expect(slotActions(group)).toHaveCSS('opacity', '1');
    await expect(slot(group)).toHaveCSS('opacity', '0');
    await expect(
      header.getByRole('button', { name: 'Turn the group “PR 412 · checkout” off' }),
    ).toBeVisible();
    await expect(
      header.getByRole('button', { name: 'More actions for PR 412 · checkout' }),
    ).toBeVisible();
    await look(page, header, shot('group-pointer'));
  });

  await test.step('Turned off from its slot: “Off”, its chip and name step back, its rules fade', async () => {
    await header
      .getByRole('button', { name: 'Turn the group “PR 412 · checkout” off' })
      .click();
    await page.mouse.move(0, 0);
    await expect(slot(group)).toHaveText('Off');
    await expect(group).toHaveAccessibleDescription('Off.');
    await expect(header.locator('[data-slot="monogram"]')).toHaveAttribute(
      'data-off',
      'true',
    );
    await expect(item(page, 'Checkout fails')).toHaveAttribute('data-group-off', '');
    expect((await storedGroup(flowShop, 'pr-412')).enabled).toBe(false);
    await look(page, groupBlock(page, 'pr-412'), shot('group-turned-off'));
  });

  await test.step('Its ⋯ menu: the group’s items, Turn the group on among them, which turns it back on', async () => {
    await header.hover();
    await header
      .getByRole('button', { name: 'More actions for PR 412 · checkout' })
      .click();
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'New rule in this group',
      'Rename F2',
      'Turn the group on',
      'Duplicate',
      'Export group',
      'Ungroup',
      'Delete',
    ]);
    await look(page, [header, menu], shot('group-menu'));
    await menu.getByRole('menuitem', { name: 'Turn the group on' }).click();
    await menuShut(page);
    await page.mouse.move(0, 0);
    await expect(slot(group)).toHaveText('2');
    expect((await storedGroup(flowShop, 'pr-412')).enabled).toBe(true);
  });

  await test.step('With focus from the keyboard: its ring, and its actions in its slot', async () => {
    await item(page, 'Feature flags').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await expect(group).toBeFocused();
    expect(await ringed(group)).toBe(true);
    await expect(slotActions(group)).toHaveCSS('opacity', '1');
    await expect(slot(group)).toHaveCSS('opacity', '0');
    await look(page, header, shot('group-focus'));
  });
});

test('Rule list: a long name in Commit Mono and Larger, at 420 px, then where the time gives way first', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({
    size: NARROW,
    appearance: { font: 'mono', size: 'larger' },
  });
  const name = 'Overdue invoices for every organization on the enterprise plan';

  await test.step('F2 on Overdue invoices makes its name a field, which takes a long one', async () => {
    await item(page, 'Invoices (GraphQL)').focus();
    await page.keyboard.press('End');
    await page.keyboard.press('F2');
    const field = page.getByTestId('rule-name-input');
    await expect(field).toBeFocused();
    await expect(field).toHaveAccessibleName('Rule name');
    await expect(field).toHaveValue('Overdue invoices');
    await field.fill(name);
    await field.press('Enter');
    await expect(item(page, name)).toBeFocused();
    await expect
      .poll(async () => (await storedRule(flowShop, 'overdue')).name)
      .toBe(name);
  });

  await test.step('At 420 px the name gives way: cut, and whole in the row’s tooltip; the slot keeps its words', async () => {
    const row = item(page, name);
    await page.keyboard.press('ArrowUp');
    await expect(item(page, 'Invoices (GraphQL)')).toBeFocused();
    const title = row.locator('[data-slot="item-title"]');
    expect(
      await title.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);
    await row.hover();
    // Its URL is cut too, in this width: the tooltip holds both whole.
    await expect(row).toHaveAttribute(
      'title',
      `${name}\n/api/v2/organizations/acme/billing/invoices?status=overdue`,
    );
    await page.mouse.move(0, 0);
    // The name has room above its floor (7em), so the slot needn't give way yet.
    await expect(slot(row)).toHaveText('1 mocked · now');
    expect(await inSight(row, 'rule-signal')).toBe(true);
    expect(await inSight(row, 'rule-time')).toBe(true);
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBe(420);
    await look(page, row, shot('row-long-name-420'));
  });

  await test.step('Widened, with the sidebar at its narrowest, the row is short of room: the time goes first', async () => {
    await page.setViewportSize(WIDE);
    const handle = page.getByRole('separator', { name: 'Sidebar width' });
    await handle.focus();
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '260');
    const row = item(page, name);
    // The last row, below the fold of a list in larger type: scrolled to, as a user would.
    await row.scrollIntoViewIfNeeded();
    await expect(row.getByTestId('rule-signal')).toHaveText('1 mocked');
    expect(await inSight(row, 'rule-signal')).toBe(true);
    expect(await inSight(row, 'rule-time')).toBe(false);
    await look(page, row, shot('row-long-name-narrowest'));
  });
});

test('Rule list: from the keyboard, one Tab stop, the arrows, Home and End, F2, Enter', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Feature flags' });
  const tree = page.getByRole('tree', { name: 'Rules' });
  const flags = item(page, 'Feature flags');
  const pro = item(page, 'Pro plan user');
  const group = item(page, 'PR 412 · checkout');

  await test.step('Tab from the search field reaches the list once, at the open rule, ringed', async () => {
    await page.getByPlaceholder('Search rules').click();
    for (const stop of ['New group', 'New rule', 'Rules', 'Traffic']) {
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toHaveAccessibleName(new RegExp(`^${stop}`));
    }
    await page.keyboard.press('Tab');
    await expect(flags).toBeFocused();
    await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
    expect(await ringed(flags)).toBe(true);
    // Then the row's own two controls, then out of the list; and back.
    for (let press = 0; press < 3; press++) await page.keyboard.press('Tab');
    expect(
      await tree.evaluate((element) => element.contains(document.activeElement)),
    ).toBe(false);
    for (let press = 0; press < 3; press++) await page.keyboard.press('Shift+Tab');
    await expect(flags).toBeFocused();
    await look(page, flags, shot('keys-tab-stop'));
  });

  await test.step('Home goes to the first row, Pro plan user', async () => {
    await page.keyboard.press('Home');
    await expect(pro).toBeFocused();
    await look(page, pro, shot('keys-first'));
  });

  await test.step('↓ goes to the group’s header, PR 412 · checkout, unfolded', async () => {
    await page.keyboard.press('ArrowDown');
    await expect(group).toBeFocused();
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await look(page, group, shot('keys-group'));
  });

  await test.step('← folds the group: its two rules leave the list', async () => {
    await page.keyboard.press('ArrowLeft');
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await expect(item(page, 'Checkout fails')).toBeHidden();
    await expect(group).toBeFocused();
    await look(page, group, shot('keys-group-folded'));
  });

  await test.step('→ unfolds it again, as it was', async () => {
    await page.keyboard.press('ArrowRight');
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'Checkout fails')).toBeVisible();
    await expect(group).toBeFocused();
    await look(page, group, shot('keys-group'));
  });

  await test.step('End goes to the last row, Overdue invoices', async () => {
    await page.keyboard.press('End');
    await expect(item(page, 'Overdue invoices')).toBeFocused();
    await look(page, item(page, 'Overdue invoices'), shot('keys-last'));
  });

  await test.step('Home, then F2: the name is a field in the row, all of it selected', async () => {
    await page.keyboard.press('Home');
    await expect(pro).toBeFocused();
    await page.keyboard.press('F2');
    const field = page.getByTestId('rule-name-input');
    await expect(field).toBeFocused();
    await expect(field).toHaveAccessibleName('Rule name');
    await expect(field).toHaveValue('Pro plan user');
    expect(
      await field.evaluate((input) => [input.selectionStart, input.selectionEnd]),
    ).toEqual([0, 'Pro plan user'.length]);
    await look(page, ruleRow(page, 'pro'), shot('keys-rename'));
  });

  await test.step('Esc leaves the name as it was, and the focus on its row', async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rule-name-input')).toHaveCount(0);
    await expect(pro).toBeFocused();
    expect((await storedRule(flowShop, 'pro')).name).toBe('Pro plan user');
    await look(page, pro, shot('keys-first'));
  });

  await test.step('↓ ↓ to Checkout fails, past its group’s header, and Enter opens it', async () => {
    for (let press = 0; press < 2; press++) await page.keyboard.press('ArrowDown');
    const checkout = item(page, 'Checkout fails');
    await expect(checkout).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('rule-name')).toHaveValue('Checkout fails');
    await expect(checkout).toHaveAttribute('aria-selected', 'true');
    await expect(checkout).toBeFocused();
    await look(page, checkout, shot('keys-opened'));
  });
});

test('Rule list: the right-click menus, and the same from the keyboard', async ({
  flowEditor,
}) => {
  const page = await flowEditor({ rule: 'Feature flags' });
  const pro = item(page, 'Pro plan user');

  await test.step('A right-click on Pro plan user: its ⋯ items, at the pointer, the row marked', async () => {
    const box = await pro.boundingBox();
    // On the element, which Playwright checks the point lands on: a right-click that missed the
    // app's menus would get the browser's own, which headless Chromium closes on.
    await pro.click({ button: 'right', position: { x: 120, y: 20 } });
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Open ↵',
      'Rename F2',
      'Duplicate',
      'Move to group',
      'Export this rule',
      'Delete',
    ]);
    await expect(ruleRow(page, 'pro')).toHaveAttribute('data-context-open');
    const at = await menu.boundingBox();
    expect(Math.abs(at.x - (box.x + 120))).toBeLessThanOrEqual(4);
    await look(page, [ruleRow(page, 'pro'), menu], shot('menu-rule'));
    await menuShut(page);
  });

  await test.step('A right-click on the group’s header: the group’s items', async () => {
    const header = groupBlock(page, 'pr-412').getByTestId('group');
    const box = await header.boundingBox();
    await header.click({ button: 'right', position: { x: 120, y: box.height / 2 } });
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'New rule in this group',
      'Rename F2',
      'Turn the group off',
      'Duplicate',
      'Export group',
      'Ungroup',
      'Delete',
    ]);
    await look(page, [header, menu], shot('menu-group'));
    await menuShut(page);
  });

  await test.step('The ContextMenu key on the focused row opens it at the row’s bottom left', async () => {
    await page.mouse.move(0, 0);
    await item(page, 'Feature flags').focus();
    await page.keyboard.press('Home');
    await expect(pro).toBeFocused();
    const row = await pro.boundingBox();
    await page.keyboard.press('ContextMenu');
    const menu = await menuOpen(page);
    const at = await menu.boundingBox();
    // At the row's bottom left, as a right-click there would be.
    expect(Math.abs(at.x - row.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(at.y - (row.y + row.height))).toBeLessThanOrEqual(8);
    await look(page, [ruleRow(page, 'pro'), menu], shot('menu-from-keys'));
    await menuShut(page);
    await expect(pro).toBeFocused();
  });

  await test.step('Shift+F10 opens the same menu in the same place', async () => {
    await page.keyboard.press('Shift+F10');
    const menu = await menuOpen(page);
    // Open and Rename, then Duplicate, Move to group, Export this rule and Delete.
    await expect(menu.getByRole('menuitem')).toHaveCount(6);
    await look(page, [ruleRow(page, 'pro'), menu], shot('menu-from-keys'));
    await menuShut(page);
    await expect(pro).toBeFocused();
  });
});
