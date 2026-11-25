// The toolbar popup's views, each compared with its saved picture, 330 wide and as tall as it is:
// its three tabs, beside the page with the traffic (This page, All rules, Sites), and This page at
// Commit Mono, Larger and Most. extension.mjs opens it as the toolbar would.
import { expect, test } from './extension.mjs';

test('This page', async ({ popup }) => {
  const page = await popup();
  await expect(page.locator('body')).toHaveScreenshot('popup-this-page.png');
});

test('All rules', async ({ popup }) => {
  const page = await popup();
  await page.locator('[data-testid="view-rules"]').click();
  await page.mouse.move(0, 0);
  await expect(page.locator('body')).toHaveScreenshot('popup-all-rules.png');
});

test('Sites', async ({ popup }) => {
  const page = await popup();
  await page.locator('[data-testid="view-sites"]').click();
  await page.mouse.move(0, 0);
  await expect(page.locator('body')).toHaveScreenshot('popup-sites.png');
});

test('This page at Commit Mono, Larger and Most', async ({ popup }) => {
  const page = await popup({
    appearance: { font: 'mono', size: 'larger', contrast: 'most' },
  });
  await expect(page.locator('body')).toHaveScreenshot('popup-appearance.png');
});
