// The open rule, walked as a user would (reports/t3-design-plan.md, 4a): its crumbs (at rest,
// under the pointer, their menus, a rename in place by double-click and by F2), the Status row
// (its hairline under the pointer, its codes, a code picked, the server's status kept), and the
// Diff row (its counts, which follow the body once typing pauses, and the row opening Diff); and,
// with the sidebar hidden, the group renamed in its crumb (6a.13). Each step is one state, checked
// as a user meets it, then pictured at 2x (baselines/<platform>/open-rule/).
import {
  expect,
  item,
  look,
  menuOpen,
  menuShut,
  moveClock,
  pauseClock,
  resumeClock,
  storedGroups,
  storedRule,
  test,
} from './extension.mjs';

const shot = (name) => ['open-rule', `${name}.png`];
const statusRow = (page) =>
  page
    .locator('[data-slot="accordion-split"]')
    .filter({ has: page.getByTestId('row-status') });

test('Open rule: the crumbs at rest, under the pointer, their menus, and renamed in place', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Checkout fails' });
  const path = page.getByTestId('rules-head-path');
  const group = page.getByTestId('crumb-group');
  const name = page.getByTestId('crumb-name');

  await test.step('At rest: its group, then its name', async () => {
    await expect(path).toHaveAccessibleName('Where the rule is');
    await expect(group).toHaveAccessibleName('Group “PR 412 · checkout”');
    await expect(name).toHaveAccessibleName('Rule “Checkout fails”');
    await look(page, path, shot('crumbs'));
  });

  await test.step('The group’s crumb under the pointer: a chevron where its “/” was', async () => {
    await group.hover();
    const marks = group.locator('span[aria-hidden="true"] > *');
    await expect(marks.first()).toHaveText('/');
    await expect(marks.first()).toHaveCSS('opacity', '0');
    await expect(marks.last()).toHaveCSS('opacity', '1');
    await look(page, path, shot('crumb-group-pointer'));
  });

  await test.step('Pressed, its menu: the group’s items, as its ⋯ has them, Turn the group off among them', async () => {
    await group.click();
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'New rule in this group',
      'Rename',
      'Turn the group off',
      'Duplicate',
      'Export group',
      'Ungroup',
      'Delete',
    ]);
    await look(page, [path, menu], shot('crumb-group-menu'));
    await menuShut(page);
  });

  await test.step('The name’s menu: the rule’s items, as its ⋯ has them', async () => {
    await name.click();
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Duplicate',
      'Move to group',
      'Export this rule',
      'Delete',
    ]);
    await look(page, [path, menu], shot('crumb-name-menu'));
    await menuShut(page);
  });

  await test.step('A double-click on the name: a field in its place, the name selected', async () => {
    await name.dblclick();
    const field = page.getByTestId('crumb-name-input');
    await expect(field).toBeFocused();
    await expect(field).toHaveAccessibleName('Rule name');
    await expect(field).toHaveValue('Checkout fails');
    expect(
      await field.evaluate((input) => [input.selectionStart, input.selectionEnd]),
    ).toEqual([0, 'Checkout fails'.length]);
    await page.mouse.move(0, 0);
    await look(page, path, shot('crumb-rename'));
  });

  await test.step('A new name and Enter: the crumb and the list’s row say it, and it’s stored; the crumb, focused again, shows its tooltip', async () => {
    await page.keyboard.type('Checkout declined');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('crumb-name-input')).toHaveCount(0);
    await expect(name).toHaveAccessibleName('Rule “Checkout declined”');
    await expect(name).toBeFocused();
    await expect(item(page, 'Checkout declined')).toBeVisible();
    await expect
      .poll(async () => (await storedRule(flowShop, 'checkout')).name)
      .toBe('Checkout declined');
    // The focus back on it from the keyboard opens its tooltip, as Tab would.
    const tip = page.locator('[data-slot="tooltip"]');
    await expect(tip).toContainText('Rule actions. Double-click to rename it');
    await expect(tip.locator('[data-slot="tooltip-keys"]')).toHaveText('F2');
    await look(page, [path, tip], shot('crumbs-renamed'));
    await look(page, item(page, 'Checkout declined'), shot('row-renamed'));
  });

  await test.step('F2 on the name’s crumb: the same field, and Esc leaves the name as it was', async () => {
    await name.focus();
    await page.keyboard.press('F2');
    const field = page.getByTestId('crumb-name-input');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Checkout declined');
    await look(page, path, shot('crumb-rename-f2'));
    await page.keyboard.press('Escape');
    await expect(field).toHaveCount(0);
    await expect(name).toBeFocused();
    expect((await storedRule(flowShop, 'checkout')).name).toBe('Checkout declined');
  });
});

// With the sidebar hidden (⌘B), Rename from the group's crumb renames the group in the crumb, as
// the name's crumb does, where it's seen (reports/t3-design-plan.md, 6a.13).
test('Open rule: Rename from the group’s crumb with the sidebar hidden, in the crumb', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Checkout fails' });
  const path = page.getByTestId('rules-head-path');
  const crumb = page.getByTestId('crumb-group');

  await test.step('⌘B hides the sidebar: the crumbs at the header’s left', async () => {
    await page.keyboard.press('ControlOrMeta+b');
    await expect(page.getByRole('tree', { name: 'Rules' })).toBeHidden();
    await look(page, path, shot('crumbs-sidebar-hidden'));
  });

  await test.step('Rename from the group’s crumb: its name a field there, focused, all of it selected', async () => {
    await crumb.click();
    const menu = await menuOpen(page);
    await menu.getByRole('menuitem', { name: 'Rename' }).click();
    const field = page.getByRole('textbox', { name: 'Group name' });
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('PR 412 · checkout');
    expect(
      await field.evaluate((input) => [input.selectionStart, input.selectionEnd]),
    ).toEqual([0, 'PR 412 · checkout'.length]);
    await page.mouse.move(0, 0);
    await look(page, path, shot('crumb-group-rename-hidden'));
  });

  await test.step('A new name and Enter: the crumb says it, has the focus again, with its tooltip, and it’s stored', async () => {
    await page.keyboard.type('PR 412 · payments');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('crumb-group-input')).toHaveCount(0);
    await expect(crumb).toHaveAccessibleName('Group “PR 412 · payments”');
    await expect(crumb).toBeFocused();
    await expect
      .poll(async () => (await storedGroups(flowShop)).map((group) => group.name))
      .toEqual(['PR 412 · payments', 'Billing GraphQL']);
    const tip = page.locator('[data-slot="tooltip"]');
    await expect(tip).toHaveText('Group actions');
    await look(page, [path, tip], shot('crumb-group-renamed'));
  });

  await test.step('⌘B shows the sidebar again: the list says the new name', async () => {
    await page.keyboard.press('ControlOrMeta+b');
    const group = item(page, 'PR 412 · payments');
    await expect(group).toBeVisible();
    await look(page, group.getByTestId('group'), shot('group-renamed-in-list'));
  });
});

test('Open rule: Status under the pointer, its codes, a code picked, and the server’s status kept', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user' });
  const row = statusRow(page);

  await test.step('Under the pointer, a hairline between what Status says and its menu', async () => {
    await page.getByTestId('row-status').hover();
    await expect(row.locator('[data-slot="accordion-split-line"]')).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await look(page, row, shot('status-pointer'));
  });

  await test.step('Its menu: the common codes, the one in use (200) checked', async () => {
    await page.getByRole('button', { name: 'Common status codes' }).click();
    const menu = await menuOpen(page);
    await expect(menu.getByRole('group', { name: 'Status code' })).toBeVisible();
    await expect(page.getByTestId('status-menu-200')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('status-menu-server')).toHaveCount(0);
    await look(page, [row, menu], shot('status-menu'));
  });

  await test.step('404 picked: the menu closes, the row says it, and the rule sends it', async () => {
    await page.getByTestId('status-menu-404').click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('row-status')).toContainText('404');
    await expect
      .poll(async () => (await storedRule(flowShop, 'pro')).response.status)
      .toBe('404');
    await page.mouse.move(0, 0);
    await look(page, row, shot('status-404'));
  });

  await test.step('Slow search keeps the server’s status: “Server’s status”, first and checked', async () => {
    await item(page, 'Slow search').click();
    await expect(page.getByTestId('rule-name')).toHaveValue('Slow search');
    await page.getByRole('button', { name: 'Common status codes' }).click();
    const menu = await menuOpen(page);
    const first = menu.getByRole('menuitemradio').first();
    await expect(first).toHaveText("Server's status");
    await expect(first).toHaveAttribute('aria-checked', 'true');
    await look(page, [statusRow(page), menu], shot('status-menu-server'));
    await menuShut(page);
  });
});

test('Open rule: the Diff row’s counts, typing in the body, the counts once typing pauses, and Diff', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user' });
  const diff = page.getByTestId('diff-switch');
  const counts = page.getByTestId('diff-row-counts');
  const body = page.locator('.code textarea');
  // The Diff row and the body's first lines under it.
  const top = async () => {
    const box = await diff.boundingBox();
    return { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 150 };
  };

  await test.step('The Diff row: what it compares with, and the lines added and taken out, +2 −1', async () => {
    await expect(diff).toHaveAttribute('aria-pressed', 'false');
    await expect(counts).toHaveText('+2−1');
    await expect(diff).toHaveAccessibleName(
      /^Diff vs server's response.*2 lines added, 1 removed$/,
    );
    await look(page, diff, shot('diff-row'));
  });

  await test.step('A line typed into the body: the counts wait while typing goes on', async () => {
    await pauseClock(flowShop);
    await body.click();
    // The text's start and a line's end, as this platform's keys go (Home and End only scroll on a
    // Mac).
    const mac = process.platform === 'darwin';
    await page.keyboard.press(mac ? 'Meta+ArrowUp' : 'Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press(mac ? 'Meta+ArrowRight' : 'End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('"role": "admin",');
    await expect(body).toHaveValue(/"id": 42,\n\s*"role": "admin",\n/);
    await expect(counts).toHaveText('+2−1');
    await look(page, await top(), shot('diff-typing'));
  });

  await test.step('Typing paused half a second: the counts follow, +3 −1, and the body is kept', async () => {
    await moveClock(flowShop, 500);
    await expect(counts).toHaveText('+3−1');
    await resumeClock(flowShop);
    await expect
      .poll(async () => (await storedRule(flowShop, 'pro')).response.body)
      .toContain('"role": "admin"');
    await look(page, await top(), shot('diff-settled'));
  });

  await test.step('The row pressed: Diff, the body against the server’s response, in the editor’s place', async () => {
    await diff.click();
    await expect(diff).toHaveAttribute('aria-pressed', 'true');
    const shown = page.getByTestId('diff');
    await expect(shown).toBeVisible();
    await expect(shown).toContainText('"plan": "free"');
    await expect(shown).toContainText('"role": "admin"');
    await page.mouse.move(0, 0);
    const box = await diff.boundingBox();
    await look(
      page,
      { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: 330 },
      shot('diff-open'),
    );
  });
});
