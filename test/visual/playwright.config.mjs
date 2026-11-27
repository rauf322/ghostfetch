// The screenshot suite (npm run test:visual, which builds first): Playwright Test compares each
// view of the editor and the popup with its saved picture, baselines/<platform>/<name>.png, and
// writes an HTML report of every difference to playwright-report/ (npx playwright show-report
// test/visual/playwright-report). `npm run test:visual -- --update-snapshots` takes new pictures.
// The views are in the *.spec.mjs files here, the browser and what's in it in extension.mjs.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  // One browser, set up once (extension.mjs's shop), so the views run one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  outputDir: 'test-results',
  // The pictures by their names, a folder for each platform: fonts and drawing differ between
  // them, so each keeps its own.
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  expect: {
    // Pictures at 1x (the pages' CSS pixels), animations stopped (the pulse), the caret hidden;
    // a pixel counts as changed past `threshold` (YIQ colour distance, 0 to 1).
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0,
      maxDiffPixels: 0,
    },
    toMatchSnapshot: { threshold: 0, maxDiffPixels: 0 },
  },
});
