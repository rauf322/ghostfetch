// Traffic's views, each compared with its saved picture: wide with a request open, in a 420 px
// panel, and a copy button saying "Copied". The page's requests, their times and durations fixed:
// extension.mjs.
import { NARROW, expect, pauseClock, resumeClock, test } from './extension.mjs';

// The request a rule answered with a 500, sent 3 s before NOW.
const CHECKOUT = '[data-testid="request"]:has-text("/api/checkout")';

test('Traffic wide, a request open', async ({ editor }) => {
  const page = await editor({ view: 'traffic' });
  await page.locator(CHECKOUT).click();
  await page.locator('[data-testid="request-detail"]').waitFor();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('traffic-wide-request.png');
});

test('Traffic in a 420 px panel', async ({ editor }) => {
  const page = await editor({ size: NARROW, view: 'traffic' });
  await expect(page).toHaveScreenshot('traffic-narrow.png');
});

test('a copy button saying "Copied"', async ({ editor, shop }) => {
  const page = await editor({ view: 'traffic' });
  await page.locator(CHECKOUT).click();
  await page.locator('[data-testid="request-detail"]').waitFor();
  // The copy itself always works: what's looked at is the button that says so.
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {};
  });
  const copy = page.locator('[data-testid="copy-url"]');
  // "Copied" stays a second (COPIED_FOR): with the clock held, until the picture is taken. The
  // words are always in the button, unseen at rest, so it's its data-copied that says it copied.
  await pauseClock(shop);
  try {
    await copy.click();
    await expect(copy).toHaveAttribute('data-copied', 'true');
    await expect(page).toHaveScreenshot('traffic-copied.png');
  } finally {
    await resumeClock(shop);
  }
});
