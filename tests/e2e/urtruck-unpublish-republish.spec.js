/**
 * UI verification for the unpublish/republish cycle (PR2 blocker review,
 * 05.08.2026): an unpublished trip must show "Снято с публикации" +
 * "Опубликовать снова" in the Архив list, and after a successful republish
 * the card must disappear from Архив and reappear in the active list —
 * driven entirely by a dashboard refetch (MyTripsScreen.republishItem calls
 * load() on success), no client-side status inference.
 *
 * Local: E2E_BASE_URL=http://127.0.0.1:4599 npx playwright test tests/e2e/urtruck-unpublish-republish.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz') + '/?v=unpub-repub';

const DRIVER_ID = 'pw-driver-unpub1';
const TRIP_ID = 'trip-pw-unpub1';

function makeTrip(status) {
  return {
    id: TRIP_ID, driver_id: DRIVER_ID, driver_name: 'PW Driver',
    from_city: 'Almaty', to_city: 'Tashkent', truck_type: 'tent',
    capacity_tons: 20, available_m3: 82, price: 5000, currency: 'USD',
    status,
    created_at: '2026-08-05 10:00:00', updated_at: '2026-08-05 10:00:00',
    from_country: 'KZ', to_country: 'UZ',
  };
}

async function mockServer(page) {
  const box = { status: 'unpublished' };

  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, token: 'pw-tok-unpub', access_token: 'pw-tok-unpub', role: 'driver', user_id: DRIVER_ID, user: { id: DRIVER_ID, role: 'driver' } }),
    });
  });
  await page.route('**/api/v1/register/me', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: DRIVER_ID, role: 'driver', verification_level: 3 }) });
  });
  await page.route('**/api/v1/users/me**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: DRIVER_ID, name: 'PW Driver', city: '', about: '' }) });
  });
  await page.route('**/api/v1/market/cargos**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cargos: [], total: 0 }) });
  });
  await page.route('**/api/v1/market/trips**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [makeTrip(box.status)], total: 1 }) });
  });
  await page.route('**/api/v1/market/drivers**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ drivers: [] }) });
  });
  await page.route('**/api/v1/market/bids**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bids: [], count: 0, is_owner: true }) });
  });
  await page.route('**/api/v1/market/my', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ my_cargos: [], my_bids: [], incoming_bids: [], my_trips: [makeTrip(box.status)], my_deals: [] }),
    });
  });
  // The republish endpoint: mirrors the real backend — flips status to
  // 'active' server-side. The UI must reflect this via a fresh dashboard
  // fetch (load()), not by guessing the new status locally.
  await page.route('**/api/v1/market/trips/*/republish', async route => {
    box.status = 'active';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'active' }) });
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
  return box;
}

async function enterAsDriver(page) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => localStorage.setItem('ur_reg_token', 'pw-tok-unpub'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

test.describe('Unpublished card -> republish -> back to active', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('shows "Снято с публикации" + "Опубликовать снова", then moves out of Архив after republish', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

    await mockServer(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);

    await page.locator('[data-testid="bottom-nav-mywork"]').click();
    await page.waitForTimeout(1000);

    // The unpublished trip must NOT be in the active "Мои рейсы" list
    // ('my-trip-card' is the testID for a plain trip/cargo listing card;
    // 'my-order-card' is only used for deal cards, not plain postings).
    await expect(page.locator('[data-testid="my-trip-card"]')).toHaveCount(0);

    // Open Архив — the unpublished card lives there.
    await page.locator('[data-testid="my-work-archive-toggle"]').click();
    await page.waitForTimeout(800);

    let body = await page.locator('body').innerText();
    expect(body).toContain('Снято с публикации');
    expect(body).toContain('Опубликовать снова');

    const republishBtn = page.locator('[data-testid="republish-btn"]');
    await expect(republishBtn).toBeVisible();
    await republishBtn.click();
    await page.waitForTimeout(1500); // await republish PATCH + load() refetch

    // Архив no longer shows the card (still on the archive view).
    body = await page.locator('body').innerText();
    expect(body).not.toContain('Снято с публикации');

    // Back to the active list — the trip is there now (active status).
    await page.locator('[data-testid="my-work-archive-toggle"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-testid="my-trip-card"]').first()).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  });
});
