// Traffic, walked as a user would (reports/t3-design-plan.md, 3c and 2c): a row at rest (its
// status over its duration, how long ago), its actions under the pointer and with focus, Enter and
// Esc, the right-click menu and Open the rule, Copy URL from a row; each of a request's copy
// buttons saying "Copied" and back after its second (the clock moved, not waited for); and rows
// passing their first minute as the clock moves on. Each step is one state, checked as a user
// meets it, then pictured at 2x (baselines/<platform>/traffic/).
import {
  ORIGIN,
  expect,
  look,
  menuOpen,
  moveClock,
  pauseClock,
  resumeClock,
  ringed,
  slot,
  slotActions,
  test,
} from './extension.mjs';

const shot = (name) => ['traffic', `${name}.png`];
const request = (page, path) =>
  page.locator(`[data-testid="request"][title="${ORIGIN}${path}"]`);
const timeGroup = (page, label) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: label, exact: true }) });
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

test('Traffic: a row at rest, under the pointer, with focus, opened and closed, its menu, and Copy URL', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ view: 'traffic' });
  const user = request(page, '/api/user');
  const open = user.getByTestId('request-open');

  await test.step('At rest: what was asked, which rule answered and how long ago, its status over its duration', async () => {
    await expect(user.getByTestId('request-path')).toHaveText('/api/user');
    await expect(open).toHaveAccessibleName('GET /api/user Mocked by Pro plan user · 4m');
    await expect(user.getByTestId('request-time')).toHaveText('· 4m');
    await expect(slot(user).locator('> *')).toHaveText(['200', '1 ms']);
    // In its first minute a row says no time: "Just now" over it says that.
    await expect(request(page, '/api/projects').getByTestId('request-time')).toHaveCount(
      0,
    );
    await look(page, user, shot('row-at-rest'));
  });

  await test.step('Under the pointer, its actions where the status was: Mock, Copy URL, Copy as cURL', async () => {
    await user.hover();
    await expect(slotActions(user)).toHaveCSS('opacity', '1');
    await expect(slot(user)).toHaveCSS('opacity', '0');
    for (const name of ['Mock this response', 'Copy URL', 'Copy as cURL'])
      await expect(
        user.getByRole('button', { name: `${name}: GET /api/user` }),
      ).toBeVisible();
    await look(page, user, shot('row-pointer'));
  });

  await test.step('With focus from the keyboard (↑ from the next row), its ring and the same actions', async () => {
    await page.mouse.move(0, 0);
    await request(page, '/api/flags').getByTestId('request-open').focus();
    await page.keyboard.press('ArrowUp');
    await expect(open).toBeFocused();
    expect(await ringed(open)).toBe(true);
    await expect(slotActions(user)).toHaveCSS('opacity', '1');
    await look(page, user, shot('row-focus'));
  });

  await test.step('Enter opens the request: its URL and what it can do with it', async () => {
    await page.keyboard.press('Enter');
    const detail = page.getByTestId('request-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(detail.locator(`[title="${ORIGIN}/api/user"]`).first()).toBeVisible();
    await look(
      page,
      // Its header: what was asked, Close, Mock this response, and the copies.
      [
        detail.getByTestId('request-back'),
        detail.getByTestId('mock'),
        detail.getByTestId('copy-body'),
      ],
      shot('request-open'),
    );
  });

  await test.step('Esc closes it, and the focus is back on its row', async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('request-detail')).toBeHidden();
    await expect(open).toBeFocused();
    await look(page, user, shot('row-focus'));
  });

  await test.step('A right-click on the row: its menu, with Open the rule', async () => {
    const box = await user.boundingBox();
    // On the element, which Playwright checks the point lands on: a right-click that missed the
    // app's menus would get the browser's own, which headless Chromium closes on.
    await user.click({ button: 'right', position: { x: 240, y: box.height / 2 } });
    const menu = await menuOpen(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Mock this response',
      'Copy URL',
      'Copy as cURL',
      'Open the rule',
    ]);
    await look(page, [user, menu], shot('row-menu'));
  });

  await test.step('Open the rule: the editor turns to Pro plan user', async () => {
    await page.getByRole('menuitem', { name: 'Open the rule' }).click();
    await expect(page.getByTestId('rule-name')).toHaveValue('Pro plan user');
    await expect(
      page.getByRole('treeitem', { name: 'Pro plan user', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.mouse.move(0, 0);
    await look(
      page,
      [page.getByTestId('crumb-name'), page.getByTestId('rule-name')],
      shot('opened-rule'),
    );
    await page.getByTestId('nav-traffic').click();
    await expect(user).toBeVisible();
  });

  await test.step('Copy URL from the row: its icon a check, “Copied the URL” said, the URL copied', async () => {
    await user.hover();
    const copy = user.getByTestId('row-copy-url');
    await copy.hover();
    await pauseClock(flowShop);
    await copy.click();
    await expect(copy).toHaveAttribute('data-copied', 'true');
    await expect(
      user.locator('[data-slot="copy-announcer"]').filter({ hasText: /\S/ }),
    ).toHaveText(['Copied the URL']);
    expect(await clipboard(page)).toBe(`${ORIGIN}/api/user`);
    await look(page, user, shot('row-copied'));
  });

  await test.step('A second on, its icon is back', async () => {
    await moveClock(flowShop, 1000);
    const copy = user.getByTestId('row-copy-url');
    await expect(copy).not.toHaveAttribute('data-copied');
    await look(page, user, shot('row-copy-back'));
    await resumeClock(flowShop);
  });
});

test('Traffic: each of a request’s copy buttons says “Copied”, then is back after its second', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ view: 'traffic' });
  await request(page, '/api/user').getByTestId('request-open').click();
  const detail = page.getByTestId('request-detail');
  await expect(detail).toBeVisible();
  const copies = [
    ['copy-url', 'Copy URL', 'the URL', `${ORIGIN}/api/user`],
    ['copy-curl', 'Copy as cURL', 'the cURL command', /^curl /],
    ['copy-body', 'Copy body', 'the response body', /"firstName": "Ada"/],
  ];
  for (const [id, words, what, copied] of copies) {
    const button = detail.getByTestId(id);
    await test.step(`${words}, under the pointer`, async () => {
      await button.hover();
      await expect(button).toHaveAccessibleName(words);
      await expect(button).not.toHaveAttribute('data-copied');
      await look(page, button, shot(id));
    });

    await test.step(`${words} pressed: “Copied”, a green check, said once, and ${what} copied`, async () => {
      await pauseClock(flowShop);
      await button.click();
      await expect(button).toHaveAttribute('data-copied', 'true');
      // Its name stays its words; "Copied" is drawn, and said by the live region beside it.
      await expect(button).toHaveAccessibleName(words);
      await expect(
        detail.locator('[data-slot="copy-announcer"]').filter({ hasText: /\S/ }),
      ).toHaveText([`Copied ${what}`]);
      const text = await clipboard(page);
      if (typeof copied === 'string') expect(text).toBe(copied);
      else expect(text).toMatch(copied);
      await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
      await look(page, button, shot(`${id}-copied`));
    });

    await test.step(`A second on, ${words} is back as it was`, async () => {
      await moveClock(flowShop, 1000);
      await expect(button).not.toHaveAttribute('data-copied');
      await look(page, button, shot(id));
      await resumeClock(flowShop);
    });
  }
});

test('Traffic: 20 s on, two rows pass their first minute, and move under A few minutes ago', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ view: 'traffic' });

  await test.step('Under Just now, four requests, none saying how long ago', async () => {
    const now = timeGroup(page, 'Just now');
    await expect(now.getByTestId('request-path')).toHaveText([
      '/api/v2/organizations/acme/projects/checkout/members?role=owner&page=2',
      '/api/v2/organizations/acme/billing/invoices?status=overdue&page=2',
      '/api/projects',
      '/api/events',
    ]);
    await expect(now.getByTestId('request-time')).toHaveCount(0);
    await look(page, now, shot('just-now'));
  });

  await test.step('20 s on, /api/projects and /api/events (41 s and 43 s old) say “· 1m”, under A few minutes ago', async () => {
    await moveClock(flowShop, 20_000);
    const few = timeGroup(page, 'A few minutes ago');
    await expect(few.getByTestId('request-path')).toHaveText([
      '/api/projects',
      '/api/events',
      '/api/user',
    ]);
    await expect(few.getByTestId('request-time')).toHaveText(['· 1m', '· 1m', '· 4m']);
    await expect(timeGroup(page, 'Just now').getByTestId('request')).toHaveCount(2);
    await look(page, few, shot('a-few-minutes-ago'));
  });
});

// Fails today, so it doesn't run: focus falls to the page when a focused request moves to an older
// time group, as each group is its own list and the row is made again (reports/t3-design-
// review.md, 3c, medium: src/bounded-contexts/traffic/ui/traffic-list.tsx:213-224). Walk it once
// that's fixed, and take its picture then.
test.fixme('Traffic: a focused row keeps its focus as the clock moves it under an older time', async ({
  flowEditor,
  flowShop,
}) => {
  const page = await flowEditor({ view: 'traffic' });
  const projects = request(page, '/api/projects').getByTestId('request-open');

  await test.step('/api/projects focused from the keyboard, under Just now', async () => {
    await request(page, '/api/events').getByTestId('request-open').focus();
    await page.keyboard.press('ArrowUp');
    await expect(projects).toBeFocused();
  });

  await test.step('20 s on, under A few minutes ago, it still has the focus, ringed', async () => {
    await moveClock(flowShop, 20_000);
    await expect(
      timeGroup(page, 'A few minutes ago').getByTestId('request-path').first(),
    ).toHaveText('/api/projects');
    await expect(projects).toBeFocused();
    expect(await ringed(projects)).toBe(true);
    await look(page, request(page, '/api/projects'), shot('row-focus-moved'));
  });
});
