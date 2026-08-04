/**
 * Real screenshots for the PR2 final-blocker review (05.08.2026):
 *  - long-price rendering on FeedCard / CargoDetail / Deals at 320/375/390px
 *  - driver pending-offer card (no chat, no trip-status leak)
 *  - "Сделки → В работе" with 3 active deals
 *  - the status filter, opened and after applying a filter
 *
 * Screenshots are saved under SCREENSHOT_DIR (scratchpad, not committed) and
 * are the actual deliverable for this run — this file intentionally makes
 * light assertions and leans on page.screenshot() for the real evidence.
 *
 * Local: E2E_BASE_URL=http://127.0.0.1:4599 SCREENSHOT_DIR=/tmp/shots npx playwright test tests/e2e/urtruck-pr2-blocker-screenshots.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz') + '/?v=pr2-blockers';
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/pr2-blocker-shots';

const DRIVER_ID = 'pw-driver-blk1';
const CARGO_ID = 'cargo-pw-blk1';
const PENDING_TRIP_ID = 'trip-pw-blk-pending';
const PENDING_BID_ID = 'bid-pw-blk-pending';
const DEAL_ACCEPTED_ID = 'deal-pw-blk-accepted';
const DEAL_INPROGRESS_ID = 'deal-pw-blk-inprogress';
const DEAL_ATBORDER_ID = 'deal-pw-blk-atborder';

// A genuinely long formatted price: UZS suffix-formats as "987 654 321 сўм".
const LONG_AMOUNT = 987654321;
const LONG_CURRENCY = 'UZS';

function longCargo() {
  return {
    id: CARGO_ID, owner_id: 'pw-shipper-blk1', owner_name: 'PW Shipper',
    from_city: 'Tashkent', to_city: 'Almaty', cargo_desc: 'Хлопок в тюках',
    cargo_type: 'tent', price: LONG_AMOUNT, currency: LONG_CURRENCY,
    bids_count: 0, status: 'active',
    from_country: 'UZ', to_country: 'KZ',
    created_at: '2026-08-05 09:00:00', updated_at: '2026-08-05 09:00:00',
  };
}

function pendingTrip() {
  return {
    id: PENDING_TRIP_ID, driver_id: DRIVER_ID, driver_name: 'PW Driver',
    from_city: 'Almaty', to_city: 'Tashkent', truck_type: 'tent',
    capacity_tons: 20, available_m3: 82, price: 5000, currency: 'USD',
    status: 'active', from_country: 'KZ', to_country: 'UZ',
    created_at: '2026-08-05 09:00:00', updated_at: '2026-08-05 09:00:00',
  };
}

function makeDeal(id, status, amount, currency, fromCity, toCity, fromCountry, toCountry) {
  return {
    id, cargo_id: null, trip_id: 'trip-' + id, bid_id: 'bid-' + id,
    shipper_id: 'pw-shipper-blk1', driver_id: DRIVER_ID,
    driver_name: 'PW Driver', shipper_name: 'PW Shipper',
    from_city: fromCity, to_city: toCity, from_country: fromCountry, to_country: toCountry,
    amount, currency, status, chat_room_id: 'room-' + id,
    created_at: '2026-08-05 09:00:00', updated_at: '2026-08-05 09:00:00',
  };
}

async function mockServer(page) {
  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, token: 'pw-tok-blk', access_token: 'pw-tok-blk', role: 'driver', user_id: DRIVER_ID, user: { id: DRIVER_ID, role: 'driver' } }),
    });
  });
  await page.route('**/api/v1/register/me', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: DRIVER_ID, role: 'driver', verification_level: 3 }) });
  });
  await page.route('**/api/v1/users/me**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: DRIVER_ID, name: 'PW Driver', city: '', about: '' }) });
  });

  // Feed: one cargo with the long UZS price.
  await page.route('**/api/v1/market/cargos**', async route => {
    const url = route.request().url();
    if (url.includes('/cargos/' + CARGO_ID)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(longCargo()) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cargos: [longCargo()], total: 1 }) });
  });

  await page.route('**/api/v1/market/trips**', async route => {
    const url = route.request().url();
    if (url.includes('/trips/' + PENDING_TRIP_ID)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pendingTrip()) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [pendingTrip()], total: 1 }) });
  });
  await page.route('**/api/v1/market/drivers**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ drivers: [] }) });
  });

  // Bids: only the pending trip has one (accept/counter/reject card).
  await page.route('**/api/v1/market/bids**', async route => {
    const url = route.request().url();
    if (url.includes('trip_id=' + PENDING_TRIP_ID)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          bids: [{ id: PENDING_BID_ID, bidder_id: 'pw-shipper-blk2', bidder_name: 'PW Shipper 2', amount: 4800, currency: 'USD', status: 'pending', created_at: '2026-08-05 10:00:00' }],
          count: 1, is_owner: true, confidential: false,
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bids: [], count: 0, is_owner: true }) });
  });

  const deals = [
    makeDeal(DEAL_ACCEPTED_ID, 'accepted', 4500, 'USD', 'Almaty', 'Bishkek', 'KZ', 'KG'),
    makeDeal(DEAL_INPROGRESS_ID, 'in_progress', LONG_AMOUNT, LONG_CURRENCY, 'Tashkent', 'Almaty', 'UZ', 'KZ'),
    makeDeal(DEAL_ATBORDER_ID, 'at_border', 6200, 'USD', 'Urumqi', 'Almaty', 'CN', 'KZ'),
  ];

  await page.route('**/api/v1/market/my', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        my_cargos: [], my_bids: [], incoming_bids: [],
        my_trips: [pendingTrip()], my_deals: deals,
      }),
    });
  });
  await page.route('**/api/v1/market/deals/' + DEAL_ACCEPTED_ID, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deals[0]) });
  });
  await page.route('**/api/v1/market/deals/' + DEAL_INPROGRESS_ID, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deals[1]) });
  });
  await page.route('**/api/v1/market/deals/' + DEAL_ATBORDER_ID, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deals[2]) });
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
  await page.evaluate(() => localStorage.setItem('ur_reg_token', 'pw-tok-blk'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

test.describe('PR2 blocker screenshots — long prices', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  for (const width of [320, 375, 390]) {
    test(`FeedCard long price @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockServer(page);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await enterAsDriver(page);
      await page.locator('[data-testid="bottom-nav-feed"]').click();
      await page.waitForTimeout(1500);
      expect(await page.locator('body').innerText()).toContain('сўм');
      await page.screenshot({ path: path.join(SHOT_DIR, `feedcard-${width}.png`) });
    });

    test(`CargoDetail long price @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockServer(page);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await enterAsDriver(page);
      await page.locator('[data-testid="bottom-nav-feed"]').click();
      await page.waitForTimeout(1500);
      await page.locator('[data-testid="cargo-card"]').first().click();
      await page.waitForTimeout(1500);
      expect(await page.locator('[data-testid="cargo-price-value"]').innerText()).toContain('сўм');
      await page.screenshot({ path: path.join(SHOT_DIR, `cargodetail-${width}.png`) });
    });

    test(`Deals list long price @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockServer(page);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await enterAsDriver(page);
      await page.locator('[data-testid="bottom-nav-deals"]').click();
      await page.waitForTimeout(1200);
      await page.locator('[data-testid="deals-tab-active"]').click();
      await page.waitForTimeout(800);
      expect(await page.locator('body').innerText()).toContain('сўм');
      await page.screenshot({ path: path.join(SHOT_DIR, `deals-${width}.png`) });
    });
  }
});

test.describe('PR2 blocker screenshots — driver screens', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('Pending offer: no chat button, no trip-status leak', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mockServer(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await page.locator('[data-testid="bottom-nav-mywork"]').click();
    await page.waitForTimeout(1000);
    await page.locator('[data-testid="my-trip-card"]').first().click();
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-testid="trip-bid-accept"]')).toBeVisible();
    // No chat before a deal exists, no legacy trip-status timeline leak.
    expect(await page.locator('body').innerText()).not.toContain('Открыть чат');
    expect(await page.locator('body').innerText()).not.toContain('Статус рейса');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pending-offer-no-chat-no-status.png') });
  });

  test('Deals -> В работе with 3 active deals', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await mockServer(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await page.locator('[data-testid="bottom-nav-deals"]').click();
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="deals-tab-active"]').click();
    await page.waitForTimeout(800);

    await expect(page.locator('[data-testid="deals-deal-card"]')).toHaveCount(3);
    await page.screenshot({ path: path.join(SHOT_DIR, 'deals-active-3-cards.png') });
  });

  test('Filter opened, then applied (in_progress only)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await mockServer(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await page.locator('[data-testid="bottom-nav-deals"]').click();
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="deals-tab-active"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-testid="deals-deal-card"]')).toHaveCount(3);

    await page.locator('[data-testid="deals-filter-btn"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOT_DIR, 'deals-filter-opened.png') });

    await page.locator('[data-testid="deals-filter-status-in_progress"]').click();
    await page.locator('[data-testid="deals-filter-apply"]').click();
    await page.waitForTimeout(800);

    await expect(page.locator('[data-testid="deals-deal-card"]')).toHaveCount(1);
    expect(await page.locator('body').innerText()).toContain('сўм');
    await page.screenshot({ path: path.join(SHOT_DIR, 'deals-filter-applied-result.png') });
  });
});
