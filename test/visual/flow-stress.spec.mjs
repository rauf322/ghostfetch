// The new parts under stress (the brief for the flows, after reports/t3-design-plan.md, 3a item 1
// and 1b): in Rosé Pine Dawn, the light theme,
// the slot, a tooltip, a menu and the undo notice; and in the narrowest window (420 px) with the
// widest type (Commit Mono, Larger), the list, the notice, an open rule and Traffic's rows, with
// nothing spilling out of the window and nothing cut but what gives way with an ellipsis. Each
// step is one state, checked as a user meets it, then pictured at 2x, a part or the whole window
// (baselines/<platform>/stress/).
import {
  NARROW,
  expect,
  footer,
  item,
  look,
  menuOpen,
  moveClock,
  pauseClock,
  resumeClock,
  test,
  undoNotice,
} from './extension.mjs';

const shot = (name) => ['stress', `${name}.png`];

// Nothing spills out of the window sideways: the page doesn't scroll, and every part drawn of what
// `scope` holds (its text and controls) ends inside the window.
async function insideTheWindow(page, scope = page.locator('body')) {
  const width = page.viewportSize().width;
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBe(width);
  const outside = await scope.evaluate((root, right) => {
    const parts = root.querySelectorAll(
      'button, a, input, [role="treeitem"], [data-slot]',
    );
    return [...parts]
      .filter((part) => {
        const box = part.getBoundingClientRect();
        return (
          box.width > 0 && box.height > 0 && (box.left < -0.5 || box.right > right + 0.5)
        );
      })
      .map(
        (part) =>
          part.dataset.slot ?? part.dataset.testid ?? part.textContent.slice(0, 30),
      );
  }, width);
  expect(outside).toEqual([]);
}

// Text cut short without an ellipsis to say so: a part that holds more than it shows, clipped,
// where it isn't one of the parts that give way with one (a name, a URL's head, a summary).
async function cutWithoutEllipsis(scope) {
  return scope.evaluate((root) =>
    [...root.querySelectorAll('span, div, p, button')]
      .filter((element) => {
        if (element.children.length || !element.textContent.trim()) return false;
        const style = getComputedStyle(element);
        return (
          element.scrollWidth > element.clientWidth + 1 &&
          style.overflowX !== 'visible' &&
          style.textOverflow !== 'ellipsis'
        );
      })
      .map((element) => element.textContent.slice(0, 40)),
  );
}

test('Stress: Rosé Pine Dawn, for the slot, a tooltip, a menu and the notice', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user', theme: 'rose-pine-dawn' });
  const flags = item(page, 'Feature flags');

  await test.step('The slot: Feature flags, 1 mocked · 5m', async () => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose-pine-dawn');
    await expect(flags.locator('[data-slot="item-status"]')).toHaveText('1 mocked · 5m');
    await look(page, flags, shot('dawn-slot'));
  });

  await test.step('A tooltip with its key: Hide the sidebar, ⌘B', async () => {
    const toggle = page.locator('[data-testid="sidebar-toggle"]:visible');
    await pauseClock(flowShop);
    await toggle.hover();
    await moveClock(flowShop, 350);
    await resumeClock(flowShop);
    const tip = page.locator('[data-slot="tooltip"]');
    await expect(tip).toContainText('Hide the sidebar');
    await expect(tip.locator('[data-slot="tooltip-keys"]')).toHaveText('⌘B');
    await look(page, [toggle, tip], shot('dawn-tooltip'));
    await page.mouse.move(0, 0);
  });

  await test.step('A menu: Feature flags’s ⋯', async () => {
    await flags.hover();
    await flags.getByRole('button', { name: 'More actions for “Feature flags”' }).click();
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveCount(4);
    await menu.getByRole('menuitem', { name: 'Delete' }).hover();
    await look(page, menu, shot('dawn-menu'), { pad: 16 });
  });

  await test.step('The notice: Delete pressed, “Rule deleted” in the footer', async () => {
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(undoNotice(page)).toContainText('Rule deleted');
    await page.mouse.move(0, 0);
    await look(page, footer(page), shot('dawn-notice'));
  });
});

test('Stress: 420 px in Commit Mono and Larger, for the list, the notice, an open rule and Traffic', async ({
  flowEditor,
}) => {
  const appearance = { font: 'mono', size: 'larger' };
  const page = await flowEditor({ size: NARROW, appearance });

  await test.step('The list: every row inside the window, names and URLs giving way with an ellipsis', async () => {
    await expect(page.locator('html')).toHaveAttribute('data-font', 'mono');
    await expect(page.locator('html')).toHaveAttribute('data-size', 'larger');
    await expect(page.getByRole('treeitem')).toHaveCount(9);
    await insideTheWindow(page);
    expect(await cutWithoutEllipsis(page.getByRole('tree', { name: 'Rules' }))).toEqual(
      [],
    );
    await look(page, null, shot('mono-larger-list'));
  });

  await test.step('The notice: Feature flags deleted, its words and its key inside the footer', async () => {
    const flags = item(page, 'Feature flags');
    await flags.hover();
    await flags.getByRole('button', { name: 'More actions for “Feature flags”' }).click();
    const menu = await menuOpen(page);
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(undoNotice(page)).toContainText('Rule deleted');
    await page.mouse.move(0, 0);
    await insideTheWindow(page, footer(page));
    expect(await cutWithoutEllipsis(footer(page))).toEqual([]);
    await look(page, footer(page), shot('mono-larger-notice'));
    await page.keyboard.press('ControlOrMeta+z');
    await expect(undoNotice(page)).toHaveCount(0);
  });

  await test.step('An open rule: Pro plan user, its rows and its body inside the window', async () => {
    await item(page, 'Pro plan user').click();
    await expect(page.getByTestId('rule-name')).toHaveValue('Pro plan user');
    await page.mouse.move(0, 0);
    await insideTheWindow(page);
    await look(page, null, shot('mono-larger-rule'));
  });

  await test.step('Traffic: its rows inside the window, their URLs cut in the middle', async () => {
    const traffic = await flowEditor({ size: NARROW, view: 'traffic', appearance });
    await expect(traffic.getByTestId('request')).toHaveCount(8);
    await insideTheWindow(traffic);
    expect(await cutWithoutEllipsis(traffic.getByTestId('traffic-list'))).toEqual([]);
    await look(traffic, null, shot('mono-larger-traffic'));
  });
});
