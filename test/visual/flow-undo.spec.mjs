// Undo, walked as a user would (reports/t3-design-plan.md, 4b): a rule deleted from its ⋯ says so
// in the sidebar's footer, not in a toast; ⌘Z puts it back in its place with the focus on its row;
// left alone, the notice goes after its 5 s (the clock moved on) and the footer is as it was; a
// group deleted and put back by the notice's own button, each row put back ringed as a key leaves
// it; at 420 px, where the open rule takes the sidebar's place, a toast with Undo; and the notice's
// time waiting for the user (6a.2). Each step is one state, checked as a user meets it, then
// pictured at 2x (baselines/<platform>/undo/). The footer at rest is one picture, met each time.
import {
  NARROW,
  expect,
  footer,
  item,
  look,
  menuOpen,
  moveClock,
  ringed,
  storedRule,
  storedRules,
  test,
  undoNotice,
} from './extension.mjs';

const shot = (name) => ['undo', `${name}.png`];
const ids = async (shop) => (await storedRules(shop)).map((rule) => rule.id);
const ORDER = ['pro', 'checkout', 'search', 'flags', 'projects', 'invoices', 'overdue'];

// Deletes a rule from its row's ⋯, as the pointer would.
async function deleteFromRow(page, name) {
  const row = item(page, name);
  await row.hover();
  await row.getByRole('button', { name: `More actions for “${name}”` }).click();
  const menu = await menuOpen(page);
  await menu.getByRole('menuitem', { name: 'Delete' }).click();
}

test('Undo: a rule deleted from its ⋯, put back with ⌘Z, deleted again and left; a group put back by the notice', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user' });

  await test.step('The footer at rest: More, Import, Export, Agent access', async () => {
    for (const name of ['More', 'Import', 'Export', 'Agent access'])
      await expect(footer(page).getByRole('button', { name, exact: true })).toBeVisible();
    await expect(undoNotice(page)).toHaveCount(0);
    await look(page, footer(page), shot('footer'));
  });

  await test.step('Feature flags deleted from its ⋯: “Rule deleted” in the footer, said once, and no toast', async () => {
    await deleteFromRow(page, 'Feature flags');
    await expect(undoNotice(page)).toBeVisible();
    await expect(undoNotice(page)).toContainText('Rule deleted');
    await expect(page.getByTestId('undo-notice-undo')).toHaveAccessibleName(
      'Command Z to undo',
    );
    await expect(page.locator('[data-slot="undo-announcer"]')).toHaveText(
      'Rule deleted. Press Command Z to undo',
    );
    await expect(footer(page).getByRole('button', { name: 'Import' })).toBeHidden();
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
    await expect(item(page, 'Feature flags')).toHaveCount(0);
    await expect.poll(() => ids(flowShop)).not.toContain('flags');
    await page.mouse.move(0, 0);
    await look(page, footer(page), shot('rule-deleted'));
  });

  await test.step('⌘Z: Feature flags back in its place, the focus on its row, ringed, the footer as it was', async () => {
    await page.keyboard.press('ControlOrMeta+z');
    await expect(undoNotice(page)).toHaveCount(0);
    const flags = item(page, 'Feature flags');
    await expect(flags).toBeFocused();
    expect(await ringed(flags)).toBe(true);
    await expect.poll(() => ids(flowShop)).toEqual(ORDER);
    await expect(page.getByRole('treeitem')).toHaveCount(9);
    await expect(page.getByRole('treeitem').nth(4)).toHaveAccessibleName('Feature flags');
    await look(page, footer(page), shot('footer'));
    await look(page, flags, shot('rule-back'));
  });

  await test.step('Deleted again and left 5 s: the notice goes, the footer exactly as before', async () => {
    await deleteFromRow(page, 'Feature flags');
    await expect(undoNotice(page)).toBeVisible();
    await page.mouse.move(0, 0);
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toHaveCount(0);
    await expect(page.locator('[data-slot="undo-announcer"]')).toHaveText('');
    await expect.poll(() => ids(flowShop)).not.toContain('flags');
    await look(page, footer(page), shot('footer'));
  });

  await test.step('PR 412 deleted from its header’s ⋯: “Group deleted”', async () => {
    const group = item(page, 'PR 412 · checkout');
    await group.getByTestId('group').hover();
    await group.getByTestId('group-menu').click();
    const menu = await menuOpen(page);
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(undoNotice(page)).toContainText('Group deleted');
    await expect(item(page, 'PR 412 · checkout')).toHaveCount(0);
    await expect(item(page, 'Checkout fails')).toHaveCount(0);
    await expect
      .poll(() => ids(flowShop))
      .toEqual(['pro', 'projects', 'invoices', 'overdue']);
    await page.mouse.move(0, 0);
    await look(page, footer(page), shot('group-deleted'));
  });

  await test.step('The notice’s own button: the group back with its two rules, the focus on its header, ringed', async () => {
    await page.getByTestId('undo-notice-undo').click();
    await expect(undoNotice(page)).toHaveCount(0);
    const group = item(page, 'PR 412 · checkout');
    await expect(group).toBeFocused();
    expect(await ringed(group)).toBe(true);
    await expect(item(page, 'Checkout fails')).toBeVisible();
    await expect(item(page, 'Slow search')).toBeVisible();
    await expect
      .poll(async () => (await storedRule(flowShop, 'search')).group)
      .toBe('pr-412');
    await page.mouse.move(0, 0);
    await look(page, group, shot('group-back'));
  });
});

test('Undo: at 420 px, with the open rule in the sidebar’s place, a delete gets a toast with Undo', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ size: NARROW, rule: 'Feature flags' });

  await test.step('Feature flags deleted from the open rule’s ⋯: a toast with Undo', async () => {
    await page.getByRole('button', { name: 'More actions' }).click();
    const menu = await menuOpen(page);
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    const toast = page.locator('[data-slot="toast"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Deleted “Feature flags”');
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect.poll(() => ids(flowShop)).not.toContain('flags');
    await page.mouse.move(0, 0);
    await look(page, toast, shot('toast-420'), { pad: 12 });
  });

  await test.step('Undo: Feature flags back', async () => {
    await page
      .locator('[data-slot="toast"]')
      .getByRole('button', { name: 'Undo' })
      .click();
    await expect.poll(() => ids(flowShop)).toEqual(ORDER);
  });
});

// The notice's five seconds wait for the user, as Base UI's toasts do: while the pointer is on it,
// while focus is in it from the keyboard, and while the window is in the background; and where it
// goes with focus in it, focus goes to the list (reports/t3-design-plan.md, 6a.2).
test('Undo: the notice waits while the pointer is on it, focus is in it or the window is away, and leaves the focus in the list as it goes', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user' });
  const undo = page.getByTestId('undo-notice-undo');

  await test.step('Feature flags deleted; the pointer on the notice, 5 s on: it’s still there', async () => {
    await deleteFromRow(page, 'Feature flags');
    await expect(undoNotice(page)).toBeVisible();
    await undoNotice(page).getByText('Rule deleted').hover();
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toBeVisible();
    await look(page, footer(page), shot('rule-deleted'));
  });

  await test.step('The pointer off it, its time goes on: 5 s on, it’s gone, the footer as it was', async () => {
    await page.mouse.move(0, 0);
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toHaveCount(0);
    await look(page, footer(page), shot('footer'));
  });

  await test.step('Empty project list deleted, and Tab to its Undo: 5 s on, it’s still there, its Undo ringed', async () => {
    await deleteFromRow(page, 'Empty project list');
    await expect(undoNotice(page)).toBeVisible();
    await page.mouse.move(0, 0);
    // From the list's Tab stop: its row's own controls, then the notice's Undo, the footer's one
    // control in sight.
    await item(page, 'Pro plan user').focus();
    for (
      let press = 0;
      press < 6 &&
      !(await undo.evaluate((element) => element === document.activeElement));
      press++
    )
      await page.keyboard.press('Tab');
    await expect(undo).toBeFocused();
    expect(await ringed(undo)).toBe(true);
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toBeVisible();
    await look(page, footer(page), shot('rule-deleted-undo-focused'));
  });

  await test.step('Shift+Tab out of it, the window in the background: 5 s on, it’s still there', async () => {
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await page.keyboard.press('Shift+Tab');
    await expect(undo).not.toBeFocused();
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toBeVisible();
    await look(page, footer(page), shot('rule-deleted'));
  });

  await test.step('The window back: 5 s on, it’s gone, the footer as it was', async () => {
    await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toHaveCount(0);
    await look(page, footer(page), shot('footer'));
  });

  await test.step('Overdue invoices deleted, the pointer pressed on its Undo and let go off it: the Undo has the focus, with no ring, and the time runs out; the focus goes to the list’s Tab stop', async () => {
    await deleteFromRow(page, 'Overdue invoices');
    await expect(undoNotice(page)).toBeVisible();
    // Pressed on the Undo and let go elsewhere, as a user changing their mind does: the button
    // has the focus, from the pointer, and isn't clicked.
    const box = await undo.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect(undo).toBeFocused();
    expect(await ringed(undo)).toBe(false);
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toHaveCount(0);
    const stop = item(page, 'Pro plan user');
    await expect(stop).toHaveAttribute('tabindex', '0');
    await expect(stop).toBeFocused();
    await look(page, stop, shot('focus-to-list'));
  });
});

// The row ⌘Z puts back shows the ring a key gives a row, to the pixel: as Home in the list leaves
// Pro plan user, with Feature flags open (rules/keys-first.png, flow-rules.spec.mjs; 6a.3).
test('Undo: the row put back has the ring a key gives it, to the pixel', async ({
  flowEditor,
}) => {
  const page = await flowEditor({ rule: 'Feature flags' });

  await test.step('Pro plan user deleted from its ⋯, and ⌘Z: its row ringed, as Home in the list leaves it', async () => {
    await deleteFromRow(page, 'Pro plan user');
    await expect(undoNotice(page)).toBeVisible();
    // The menu gone first: ⌘Z in a menu is the menu's.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await page.keyboard.press('ControlOrMeta+z');
    const pro = item(page, 'Pro plan user');
    await expect(pro).toBeFocused();
    expect(await ringed(pro)).toBe(true);
    await look(page, pro, ['rules', 'keys-first.png']);
  });
});
