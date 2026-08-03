/**
 * Regression: action-button text ("Предложить свою цену", "Отклонить", and
 * other long localized action labels) must never render outside the
 * button's own box on narrow real-device widths (iPhone SE/mini ~320-375px).
 *
 * Root cause (05.08.2026): PrimaryCTA/SecondaryButton/DestructiveButton
 * centered their icon+label row as an intrinsically-sized block instead of
 * stretching it to the button's width — Yoga/flexbox does not shrink a
 * centered child below its content size, so numberOfLines had nothing to
 * truncate against and long labels overflowed the rounded button.
 *
 * Fix: src/components/ui/actions/safeButtonStyles.js — buttons get
 * width:'100%'/maxWidth:'100%'/flexShrink:1, the icon+label row stretches to
 * the button's own width, and the label is the only flexShrink:1 element
 * left to truncate.
 *
 * This test asserts geometry, not pixels: every action button's rendered
 * text bounding box must stay within the button's own bounding box, at
 * three real device widths. No screenshots.
 *
 * Local: E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/urtruck-action-button-overflow.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz') + '/?v=btn-overflow';

const DRIVER_ID = 'pw-driver-ovf1';
const TRIP_ID = 'trip-pw-ovf1';
const BID_ID = 'bid-pw-ovf1';

function makeTrip() {
  return {
    id: TRIP_ID, driver_id: DRIVER_ID, driver_name: 'PW Driver',
    from_city: 'Almaty', to_city: 'Tashkent', truck_type: 'tent',
    capacity_tons: 20, available_m3: 82, price: 5000, currency: 'USD',
    departure: null, arrival: null, status: 'active',
    created_at: '2026-08-05 10:00:00', updated_at: '2026-08-05 10:00:00',
    from_country: 'KZ', to_country: 'UZ',
  };
}

async function mockServer(page) {
  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, token: 'pw-tok-ovf', access_token: 'pw-tok-ovf',
        role: 'driver', user_id: DRIVER_ID,
        user: { id: DRIVER_ID, role: 'driver' },
      }),
    });
  });
  await page.route('**/api/v1/register/me', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: DRIVER_ID, role: 'driver', verification_level: 3 }),
    });
  });
  await page.route('**/api/v1/users/me**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: DRIVER_ID, name: 'PW Driver', city: '', about: '' }),
    });
  });
  await page.route('**/api/v1/market/cargos**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cargos: [], total: 0 }) });
  });
  await page.route('**/api/v1/market/trips**', async route => {
    if (route.request().url().includes('/trips/' + TRIP_ID)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTrip()) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [makeTrip()], total: 1 }) });
  });
  await page.route('**/api/v1/market/drivers**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ drivers: [] }) });
  });
  // The pending bid on the driver's OWN trip — this is exactly the card
  // that renders "Принять" / "Предложить свою цену" (counter_offer) /
  // "Отклонить" (accept/counter/reject), the buttons named in the bug report.
  await page.route('**/api/v1/market/bids**', async route => {
    const url = route.request().url();
    if (url.includes('trip_id=' + TRIP_ID)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          bids: [{
            id: BID_ID, bidder_id: 'pw-shipper-ovf1', bidder_name: 'PW Shipper Long Name',
            amount: 123456.78, currency: 'USD', status: 'pending',
            created_at: '2026-08-05 11:00:00',
          }],
          count: 1, is_owner: true, confidential: false,
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bids: [], count: 0, is_owner: true }) });
  });
  await page.route('**/api/v1/market/my', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        my_cargos: [], my_bids: [], incoming_bids: [],
        my_trips: [makeTrip()], my_deals: [],
      }),
    });
  });
  await page.route('**/api/v1/reviews**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviews: [], summary: { count: 0, average: 0 } }) });
  });
  await page.route('**/api/v1/notifications/unread**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unread: 0 }) });
  });
  await page.route('**/api/v1/notifications**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
  });
  await page.route('**/api/v1/chat/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [], contacts: [], messages: [] }) });
  });
}

async function enterAsDriver(page) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => localStorage.setItem('ur_reg_token', 'pw-tok-ovf'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

async function openOwnTripWithPendingBid(page) {
  await page.locator('[data-testid="bottom-nav-mywork"]').click();
  await page.waitForTimeout(1200);
  // "Мои рейсы" (own posted trips, no deal yet) is the default sub-tab —
  // the pending-bid card ("my-trip-card") lives there, not in the
  // deal-status list ("my-order-card" is used for accepted/in_progress deals).
  const card = page.locator('[data-testid="my-trip-card"]').first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  await page.waitForTimeout(1500);
}

// Every action button's text must stay within ITS OWN button box (small
// tolerance for sub-pixel rounding), at each viewport width.
async function assertNoTextOverflow(page, buttonTestIds) {
  for (const testId of buttonTestIds) {
    const btn = page.locator(`[data-testid="${testId}"]`);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const btnBox = await btn.boundingBox();
    expect(btnBox).toBeTruthy();
    const textBox = await btn.locator('text=/./').first().boundingBox().catch(() => null);
    if (!textBox) continue;
    const TOLERANCE = 2; // sub-pixel/border rounding
    expect(textBox.x + TOLERANCE).toBeGreaterThanOrEqual(btnBox.x);
    expect(textBox.x + textBox.width).toBeLessThanOrEqual(btnBox.x + btnBox.width + TOLERANCE);
    // The button itself must never be wider than the viewport (no horizontal
    // page overflow caused by an action button).
    const viewport = page.viewportSize();
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(viewport.width + TOLERANCE);
  }
}

test.describe('Action buttons never overflow their box (pending bid card)', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  for (const width of [320, 375, 390]) {
    test(`width=${width}px: accept/counter/reject text stays inside their buttons`, async ({ page }) => {
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
      page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

      await page.setViewportSize({ width, height: 800 });
      await mockServer(page);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await enterAsDriver(page);
      await openOwnTripWithPendingBid(page);

      // The three actions from the bug report, in the order they must stack
      // vertically (never two long actions side by side).
      await expect(page.locator('[data-testid="trip-bid-accept"]')).toBeVisible();
      await expect(page.locator('[data-testid="trip-bid-counter"]')).toBeVisible();
      await expect(page.locator('[data-testid="trip-bid-reject"]')).toBeVisible();

      const acceptBox = await page.locator('[data-testid="trip-bid-accept"]').boundingBox();
      const counterBox = await page.locator('[data-testid="trip-bid-counter"]').boundingBox();
      // Stacked vertically, not paired 50/50 in a row: counter must start
      // BELOW where accept ends, not beside it.
      expect(counterBox.y).toBeGreaterThanOrEqual(acceptBox.y + acceptBox.height - 2);

      await assertNoTextOverflow(page, ['trip-bid-accept', 'trip-bid-counter', 'trip-bid-reject']);

      const body = await page.locator('body').innerText();
      expect(body).toContain('Предложить свою цену');
      expect(body).toContain('Отклонить');

      expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
    });
  }
});
