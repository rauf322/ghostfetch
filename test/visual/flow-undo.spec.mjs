// Undo, walked as a user would (reports/t3-design-plan.md, 4b): a rule deleted from its ⋯ says so
// in the sidebar's footer, not in a toast; ⌘Z puts it back in its place with the focus on its row;
// left alone, the notice goes after its 5 s (the clock moved on) and the footer is as it was; a
// group deleted and put back by the notice's own button; and, at 420 px, where the open rule takes
// the sidebar's place, a toast with Undo. Each step is one state, checked as a user meets it, then
// pictured at 2x (baselines/<platform>/undo/). The footer at rest is one picture, met three times.
import {
  NARROW,
  expect,
  footer,
  item,
  look,
  menuOpen,
  moveClock,
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

  await test.step('⌘Z: Feature flags back in its place, the focus on its row, the footer as it was', async () => {
    await page.keyboard.press('ControlOrMeta+z');
    await expect(undoNotice(page)).toHaveCount(0);
    const flags = item(page, 'Feature flags');
    await expect(flags).toBeFocused();
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

  await test.step('The notice’s own button: the group back with its two rules, the focus on its header', async () => {
    await page.getByTestId('undo-notice-undo').click();
    await expect(undoNotice(page)).toHaveCount(0);
    const group = item(page, 'PR 412 · checkout');
    await expect(group).toBeFocused();
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

// Fails today, so it doesn't run: the notice goes after its 5 s even with the pointer on it or the
// focus in it, and the focus falls to the page as it goes (reports/t3-design-review.md, 4b,
// medium: src/bounded-contexts/rules/ui/undo-delete.ts:55-63). Walk it once that's fixed, and
// take its pictures then.
test.fixme('Undo: the notice waits while the pointer is on it, and gives the focus back as it goes', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user' });

  await test.step('Feature flags deleted; the pointer on the notice, 5 s on: it’s still there', async () => {
    await deleteFromRow(page, 'Feature flags');
    await undoNotice(page).hover();
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toBeVisible();
    await look(page, footer(page), shot('rule-deleted-held'));
  });

  await test.step('The focus on its button, the pointer gone, 5 s on: it goes, and the focus goes to the list', async () => {
    await page.getByTestId('undo-notice-undo').focus();
    await page.mouse.move(0, 0);
    await moveClock(flowShop, 5000);
    await expect(undoNotice(page)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[role="tree"]') !== null,
      ),
    ).toBe(true);
  });
});
