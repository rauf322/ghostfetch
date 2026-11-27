// Tooltips, walked as a user would (reports/t3-design-plan.md, 2a): from the pointer after a short
// wait (the clock held, then moved on 350 ms), a neighbour's at once, from Tab at once, none as a
// menu closes onto its control, and one at the popup's right edge staying inside its 330 px; and
// the editor's ⋯, in the sidebar's footer and in a narrow panel's top bar, lit while its menu is
// open (7a, 7b). Each step is one state, checked as a user meets it (the words, the key, the
// control's description), then pictured at 2x (baselines/<platform>/tooltips/).
import {
  NARROW,
  expect,
  look,
  menuOpen,
  menuShut,
  moveClock,
  pauseClock,
  resumeClock,
  test,
} from './extension.mjs';

const shot = (name) => ['tooltips', `${name}.png`];
const tip = (page) => page.locator('[data-slot="tooltip"]');
// A colour of the theme's, as the page draws it: --pressed, the fill of a control pressed.
const pressedFill = (page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--pressed)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });

test('Tooltips: after a short wait, a neighbour’s at once, from Tab, and none as a menu closes onto its control', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ rule: 'Pro plan user' });
  const toggle = page.locator('[data-testid="sidebar-toggle"]:visible');
  const rules = page.getByTestId('crumb-group');

  await test.step('Hide the sidebar under the pointer: nothing at first; 350 ms on, its words and its key, ⌘B', async () => {
    await pauseClock(flowShop);
    await toggle.hover();
    await expect(tip(page)).toHaveCount(0);
    await moveClock(flowShop, 350);
    await resumeClock(flowShop);
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).not.toHaveAttribute('data-instant');
    await expect(tip(page)).toContainText('Hide the sidebar');
    await expect(tip(page).locator('[data-slot="tooltip-keys"]')).toHaveText('⌘B');
    await expect(toggle).toHaveAccessibleName('Hide the sidebar');
    await expect(toggle).toHaveAccessibleDescription('Command B');
    await look(page, [toggle, tip(page)], shot('after-the-wait'));
  });

  await test.step('Its neighbour, the Rules crumb: its tooltip at once, the first one gone', async () => {
    await rules.hover();
    await expect(tip(page)).toHaveCount(1);
    await expect(tip(page)).toHaveText('New rule');
    await expect(tip(page)).toHaveAttribute('data-instant', 'delay');
    await look(page, [toggle, rules, tip(page)], shot('neighbour-at-once'));
  });

  await test.step('From Tab: New group’s tooltip as it takes the focus', async () => {
    await page.mouse.move(0, 0);
    await expect(tip(page)).toHaveCount(0);
    await page.getByPlaceholder('Search rules').click();
    // Past the moment a tooltip just closed opens the next at once; then the clock held, so one
    // that shows has opened with the focus, on no timer.
    await moveClock(flowShop, 1000);
    await pauseClock(flowShop);
    // New group is the search field's neighbour, in its row.
    await page.keyboard.press('Tab');
    const newGroup = page.getByRole('button', { name: 'New group' });
    await expect(newGroup).toBeFocused();
    await expect(tip(page)).toHaveText('New group');
    await resumeClock(flowShop);
    await look(page, [newGroup, tip(page)], shot('from-tab'));
  });

  await test.step('The footer’s More: lit while its menu is open, the pointer gone from it', async () => {
    const more = page.getByRole('button', { name: 'More', exact: true });
    await more.click();
    const menu = await menuOpen(page);
    await page.mouse.move(0, 0);
    await expect(more).toHaveCSS('background-color', await pressedFill(page));
    await look(page, [more, menu], shot('more-lit-while-open'));
    await menuShut(page);
  });

  await test.step('The footer’s More: its menu, then Esc back onto it, and no tooltip', async () => {
    const more = page.getByRole('button', { name: 'More', exact: true });
    await more.click();
    await menuOpen(page);
    await menuShut(page);
    await expect(more).toBeFocused();
    expect(await more.evaluate((element) => element.matches(':focus-visible'))).toBe(
      true,
    );
    // Whatever would open it has had its time.
    await moveClock(flowShop, 1000);
    await expect(tip(page)).toHaveCount(0);
    await look(page, more, shot('none-as-a-menu-closes'), { pad: 12 });
  });
});

test('Tooltips: at the popup’s right edge, inside its 330 px', async ({ flowPopup }) => {
  const page = await flowPopup();

  await test.step('Pause Ghostfetch, at the top right: its long tooltip moved in to fit', async () => {
    const pause = page.getByRole('button', { name: 'Pause Ghostfetch' });
    await pause.hover();
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).toHaveText(
      'Pause Ghostfetch: no rule answers anything until you resume',
    );
    const box = await tip(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(330);
    await look(page, [pause, tip(page)], shot('popup-right-edge'));
  });
});

// A control that's off says why, and what to do, under its tooltip's label (6b.8): Make the rule in
// New rule with nothing typed, and the agent's Turn on with no pairing code, then half of one;
// with a whole code it's on, and says nothing more than it did.
test('Tooltips: an off control says why it’s off', async ({ flowEditor }) => {
  const page = await flowEditor({ rule: 'Pro plan user' });

  await test.step('New rule, nothing typed: Make the rule is off', async () => {
    await page.getByTestId('new-rule').click();
    await expect(page.getByTestId('composer-submit')).toBeDisabled();
  });

  await test.step('Under the pointer, its tooltip says what’s missing', async () => {
    await page.getByTestId('composer-submit').hover({ force: true });
    await expect(tip(page)).toContainText('Make the rule');
    await expect(tip(page)).toContainText('Type a URL or paste a cURL command first');
    await look(
      page,
      [page.getByTestId('composer-submit'), tip(page)],
      shot('off-with-reason'),
    );
  });

  await test.step('The agent’s Turn on, no code yet: off, and its tooltip says to paste one', async () => {
    await page.mouse.move(0, 0);
    await page.getByTestId('agent-button').click();
    const turnOn = page.getByTestId('agent-on');
    await expect(turnOn).toBeDisabled();
    await turnOn.hover({ force: true });
    await expect(tip(page)).toContainText('Turn on Agent access');
    await expect(tip(page)).toContainText("Paste your agent's pairing code first");
    await look(page, [turnOn, tip(page)], shot('agent-off-with-reason'));
  });

  await test.step('Half a code: still off, and it says to paste it whole', async () => {
    await page.mouse.move(0, 0);
    await page.getByTestId('agent-code').fill('47318-ABCD');
    await page.getByTestId('agent-on').hover({ force: true });
    await expect(tip(page)).toContainText(
      'Paste the pairing code whole, as your agent gives it',
    );
  });

  await test.step('A whole code: Turn on is on, and has no tooltip to say anything', async () => {
    await page.mouse.move(0, 0);
    await page.getByTestId('agent-code').fill('47318-ABCD-EFGH-JKMN-PQRS');
    const turnOn = page.getByTestId('agent-on');
    await expect(turnOn).toBeEnabled();
    await turnOn.hover();
    await page.waitForTimeout(600);
    await expect(tip(page)).toHaveCount(0);
  });
});

test('Tooltips: in a 420 px panel, the top bar’s More lit while its menu is open, as the footer’s is', async ({
  flowEditor,
}) => {
  const page = await flowEditor({ size: NARROW });

  await test.step('Its menu open, the pointer gone from it: still filled as under the pointer', async () => {
    const more = page.getByTestId('editor-menu');
    await more.click();
    const menu = await menuOpen(page);
    await page.mouse.move(0, 0);
    await expect(more).toHaveCSS('background-color', await pressedFill(page));
    await look(page, [more, menu], shot('top-more-lit-while-open'));
    await menuShut(page);
  });
});
