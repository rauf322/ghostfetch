// URLs cut in the middle, met where a user meets them (reports/t3-design-plan.md, 2b): a rule's
// row in the wide editor and at 420 px, Traffic's row and the request's header, the popup's row,
// and New rule's recent requests. Each keeps its URL's end in sight, the start giving way with an
// ellipsis; the rule's row has a tooltip with the URL whole only when it's cut. And the end of a
// wildcard pattern and of a URL ending in a slash, kept as the last segment with a letter or a
// digit, with what follows it (6b.5). Each step is one state, checked as a user meets it, then
// pictured at 2x (baselines/<platform>/urls/).
import { NARROW, ORIGIN, expect, item, look, test } from './extension.mjs';

const shot = (name) => ['urls', `${name}.png`];
const OVERDUE = '/api/v2/organizations/acme/billing/invoices?status=overdue';
const MEMBERS = '/api/v2/organizations/acme/projects/checkout/members?role=owner&page=2';
const WILDCARD = '*/api/v1/customers/*/invoices/*';
const SLASHED = '/api/invoices/42/';

// A URL cut in its middle: the whole of it kept for a screen reader and a tooltip, its end in
// sight in full, its start cut short.
async function expectCut(cut, { whole, end }) {
  await expect(cut).toHaveAttribute('data-full', whole);
  await expect(cut.locator('[data-part="tail"]')).toHaveText(end);
  await expect(cut.locator('[data-part="tail"]')).toBeInViewport({ ratio: 1 });
  expect(
    await cut
      .locator('[data-part="head"]')
      .evaluate((head) => head.scrollWidth > head.clientWidth),
  ).toBe(true);
}

test('URLs cut in the middle: a rule’s row, Traffic’s row and header, the popup, New rule’s recent requests', async ({
  flowEditor,
  flowPopup,
}) => {
  await test.step('A rule’s row, in the wide editor: “/ap… status=overdue”, and the URL whole in its tooltip', async () => {
    const page = await flowEditor({ rule: 'Pro plan user' });
    const row = item(page, 'Overdue invoices');
    await expectCut(row.locator('[data-slot="middle-truncate"]'), {
      whole: OVERDUE,
      end: 'status=overdue',
    });
    await row.hover();
    await expect(row).toHaveAttribute('title', OVERDUE);
    // A URL shown whole has no tooltip to say it again.
    const pro = item(page, 'Pro plan user');
    await pro.hover();
    await expect(pro).not.toHaveAttribute('title');
    await page.mouse.move(0, 0);
    await look(page, row, shot('rule-row-wide'));
  });

  await test.step('The same row at 420 px: more of its start, the same end', async () => {
    const page = await flowEditor({ size: NARROW });
    const row = item(page, 'Overdue invoices');
    await expectCut(row.locator('[data-slot="middle-truncate"]'), {
      whole: OVERDUE,
      end: 'status=overdue',
    });
    await look(page, row, shot('rule-row-420'));
  });

  let traffic;
  await test.step('Traffic’s row at 420 px: “… owner&page=2”', async () => {
    traffic = await flowEditor({ size: NARROW, view: 'traffic' });
    const row = traffic.locator(`[data-testid="request"][title="${ORIGIN}${MEMBERS}"]`);
    await expectCut(row.locator('[data-slot="middle-truncate"]'), {
      whole: MEMBERS,
      end: 'owner&page=2',
    });
    await look(traffic, row, shot('traffic-row-420'));
    await row.getByTestId('request-open').click();
  });

  await test.step('Opened, the request’s header cuts it the same way', async () => {
    const header = traffic
      .getByTestId('request-detail')
      .locator(`[title="${ORIGIN}${MEMBERS}"]`)
      .first();
    await expectCut(header.locator('[data-slot="middle-truncate"]'), {
      whole: MEMBERS,
      end: 'owner&page=2',
    });
    await traffic.mouse.move(0, 0);
    await look(
      traffic,
      [header, traffic.getByTestId('request-back')],
      shot('request-header-420'),
    );
  });

  await test.step('The popup’s row: “/api/v2/organiz… status=overdue”', async () => {
    const page = await flowPopup();
    const row = page.locator('[data-testid="popup-rule"][data-item="overdue"]');
    // The method is part of what's cut here, at its start.
    await expectCut(row.locator('[data-slot="middle-truncate"]'), {
      whole: `GET ${OVERDUE}`,
      end: 'status=overdue',
    });
    await look(page, row, shot('popup-row'));
  });

  await test.step('New rule’s recent requests: the one no rule answers, “… owner&page=2”', async () => {
    const page = await flowEditor({ rule: 'Pro plan user' });
    await page.getByTestId('new-rule').click();
    const recent = page.locator(
      `[data-testid="recent-request"][title="${ORIGIN}${MEMBERS}"]`,
    );
    await expectCut(recent.locator('[data-slot="middle-truncate"]'), {
      whole: MEMBERS,
      end: 'owner&page=2',
    });
    await page.mouse.move(0, 0);
    await look(page, recent, shot('recent-request'));
  });
});

// Two rules of this test's own, added here to the flows' data (each flow starts from it again):
// a wildcard pattern and a URL ending in a slash, whose ends the cut once kept as only "/*" and
// "/". In rows short of room, the sidebar at its narrowest and the text at Large (at the default
// size the slash's 17 characters still fit), both are cut, and end "/invoices/*" and "/42/"
// (6b.5).
test('URLs cut in the middle: a wildcard’s end and a trailing slash’s', async ({
  flowEditor,
  flowShop,
}) => {
  // Each a copy of Overdue invoices (a GET rule), its name and URL its own.
  await flowShop.worker.evaluate(
    async (added) => {
      const { rules } = await chrome.storage.local.get('rules');
      const like = rules.find((rule) => rule.id === 'overdue');
      await chrome.storage.local.set({
        rules: [
          ...rules,
          ...added.map(([id, name, url, mode]) => ({
            ...like,
            id,
            name,
            match: { ...like.match, url, mode },
          })),
        ],
      });
    },
    [
      ['customer-invoices', 'Customer invoices', WILDCARD, 'wildcard'],
      ['invoice-42', 'Invoice 42', SLASHED, 'contains'],
    ],
  );
  const page = await flowEditor({ rule: 'Pro plan user', appearance: { size: 'large' } });

  await test.step('The sidebar at its narrowest, the text at Large: “…/invoices/*” and “…/42/”, each end whole after the cut', async () => {
    const handle = page.getByRole('separator', { name: 'Sidebar width' });
    await handle.focus();
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '260');
    await page.mouse.move(0, 0);
    const wildcard = item(page, 'Customer invoices');
    const slashed = item(page, 'Invoice 42');
    // The last two rows, below the window's bottom: scrolled to, as a user would.
    await slashed.scrollIntoViewIfNeeded();
    await expectCut(wildcard.locator('[data-slot="middle-truncate"]'), {
      whole: WILDCARD,
      end: '/invoices/*',
    });
    await expectCut(slashed.locator('[data-slot="middle-truncate"]'), {
      whole: SLASHED,
      end: '/42/',
    });
    await look(page, [wildcard, slashed], shot('rule-rows-ends'));
  });
});
