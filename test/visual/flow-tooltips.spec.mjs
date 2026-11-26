// Tooltips, walked as a user would (reports/t3-design-plan.md, 2a): from the pointer after a short
// wait (the clock held, then moved on 350 ms), a neighbour's at once, from Tab at once, none as a
// menu closes onto its control, and one at the popup's right edge staying inside its 330 px. Each
// step is one state, checked as a user meets it (the words, the key, the control's description),
// then pictured at 2x (baselines/<platform>/tooltips/).
import {
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
    for (let press = 0; press < 3; press++) await page.keyboard.press('Tab');
    const newGroup = page.getByRole('button', { name: 'New group' });
    await expect(newGroup).toBeFocused();
    await expect(tip(page)).toHaveText('New group');
    await resumeClock(flowShop);
    await look(page, [newGroup, tip(page)], shot('from-tab'));
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

// Not walked: no control in the app is off with a reason. Make the rule (New rule, nothing typed
// yet) and the agent's Turn on (no pairing code yet) are off with none, and a pointer on them
// shows nothing; only the kit page, which isn't in the build, passes one ("Paste your agent's
// pairing code first", src/app/kit/ui/sections/tooltip-section.tsx). Listed under Looks wrong in
// the report. Walk it once a control says why.
test.fixme('Tooltips: an off control says why it’s off', async ({ flowEditor }) => {
  const page = await flowEditor({ rule: 'Pro plan user' });

  await test.step('New rule, nothing typed: Make the rule is off', async () => {
    await page.getByTestId('new-rule').click();
    await expect(page.getByTestId('composer-submit')).toBeDisabled();
  });

  await test.step('Under the pointer, its tooltip says what’s missing', async () => {
    await page.getByTestId('composer-submit').hover({ force: true });
    await expect(page.locator('[data-slot="tooltip-reason"]')).toBeVisible();
    await look(
      page,
      [page.getByTestId('composer-submit'), tip(page)],
      shot('off-with-reason'),
    );
  });
});
