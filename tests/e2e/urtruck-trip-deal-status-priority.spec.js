/**
 * Regression: TripDetail must show the ACTIVE DEAL's status
 * (accepted/in_progress/at_border/delivered), never the legacy local
 * trip.tripState timeline, once a deal exists on the trip.
 *
 * Bug (found during PR2 visual review, 04.08.2026): the backend never
 * persists trip_state at all — normalizeTrip() always falls back to
 * 'planned' for any real, server-backed trip. TripDetail rendered BOTH
 * this frozen "Запланирован" legacy timeline AND the correct
 * deal-status-driven DealStatusTimeline at the same time, so a trip whose
 * deal had already reached in_progress/at_border still showed "Запланирован"
 * as the active step above the correct "В работе"/"На границе" block below
 * it — contradictory status on one screen.
 *
 * Fix: the legacy trip.tripState timeline now renders ONLY when there is
 * no deal yet (dealStatus falsy); once a deal exists, DealStatusTimeline
 * (driven by deal.status) is the sole status display.
 *
 * Local: E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/urtruck-trip-deal-status-priority.spec.js
 * Live:  E2E_BASE_URL=https://urtruck.kz   npx playwright test tests/e2e/urtruck-trip-deal-status-priority.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz') + '/?v=trip-deal-status';

const DRIVER_ID = 'pw-driver-tds1';
const SHIPPER_ID = 'pw-shipper-tds1';
const TRIP_ID = 'trip-pw-tds1';
const DEAL_ID = 'deal-pw-tds1';
const CHAT_ID = 'room-pw-tds1';

function makeTrip() {
  return {
    id: TRIP_ID, driver_id: DRIVER_ID, driver_name: 'PW Driver',
    from_city: 'Almaty', to_city: 'Tashkent', truck_type: 'tent',
    capacity_tons: 20, available_m3: 82, price: 5000, currency: 'USD',
    departure: null, arrival: null, status: 'booked', booked_by: SHIPPER_ID,
    created_at: '2026-08-01 10:00:00', updated_at: '2026-08-01 10:00:00',
    from_country: 'KZ', to_country: 'UZ',
    // The real backend never sends trip_state — omitted on purpose so the
    // test matches production payload shape exactly.
  };
}

function makeDeal(status) {
  return {
    id: DEAL_ID, cargo_id: null, trip_id: TRIP_ID, bid_id: 'bid-pw-tds1',
    shipper_id: SHIPPER_ID, driver_id: DRIVER_ID,
    from_city: 'Almaty', to_city: 'Tashkent',
    amount: 5000, status, chat_room_id: CHAT_ID,
    created_at: '2026-08-01 10:00:00', updated_at: '2026-08-01 10:00:00',
  };
}

async function mockServer(page, { dealStatus }) {
  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, token: 'pw-tok-tds', access_token: 'pw-tok-tds',
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
  await page.route('**/api/v1/market/trips/' + TRIP_ID, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTrip()) });
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
  await page.route('**/api/v1/market/bids**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bids: [], count: 0, is_owner: true }) });
  });
  await page.route('**/api/v1/market/my', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        my_cargos: [], my_bids: [], incoming_bids: [],
        my_trips: [makeTrip()],
        my_deals: [{ ...makeDeal(dealStatus), driver_name: 'PW Driver', shipper_name: 'PW Shipper' }],
      }),
    });
  });
  await page.route('**/api/v1/market/deals/' + DEAL_ID, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDeal(dealStatus)) });
  });
  await page.route('**/api/v1/market/deals/*/status**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: dealStatus }) });
  });
  await page.route('**/api/v1/reviews**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviews: [], summary: { count: 0, average: 0 } }) });
  });
  await page.route('**/api/v1/chat/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [], contacts: [], messages: [] }) });
  });
}

// Same as mockServer, but the deal's status lives in a mutable box so a
// status-change action can actually move it (or fail to) — needed to test
// the 409-then-refetch and the successful-transition paths, where the
// server's answer must change between the initial load and after the click.
async function mockServerMutable(page, { initialStatus, statusChangeShouldFail = false }) {
  const box = { status: initialStatus };

  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, token: 'pw-tok-tds', access_token: 'pw-tok-tds', role: 'driver', user_id: DRIVER_ID, user: { id: DRIVER_ID, role: 'driver' } }),
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
    if (route.request().url().includes('/trips/' + TRIP_ID)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTrip()) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [makeTrip()], total: 1 }) });
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
      body: JSON.stringify({
        my_cargos: [], my_bids: [], incoming_bids: [], my_trips: [makeTrip()],
        my_deals: [{ ...makeDeal(box.status), driver_name: 'PW Driver', shipper_name: 'PW Shipper' }],
      }),
    });
  });
  // getDeal always answers with the CURRENT authoritative status.
  await page.route('**/api/v1/market/deals/' + DEAL_ID, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDeal(box.status)) });
  });
  // The status-change endpoint either rejects (409, box unchanged — mirrors
  // the backend's real state-machine 409) or applies the new status.
  await page.route('**/api/v1/market/deals/*/status**', async route => {
    if (statusChangeShouldFail) {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'Недопустимый переход' }) });
      return;
    }
    const url = new URL(route.request().url());
    box.status = url.searchParams.get('new_status') || box.status;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: box.status }) });
  });
  await page.route('**/api/v1/reviews**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviews: [], summary: { count: 0, average: 0 } }) });
  });
  await page.route('**/api/v1/chat/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [], contacts: [], messages: [] }) });
  });
  return box;
}

// Skip onboarding/auth/role-select entirely by seeding a token directly —
// AuthContext resolves hasToken/session/hasRole from /register/me (mocked
// above to return role:'driver'), landing straight on the driver tab bar.
async function enterAsDriver(page) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => localStorage.setItem('ur_reg_token', 'pw-tok-tds'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

// Driver "My work" tab mapping (MyTripsScreen): 'inwork' shows active deals
// (accepted/in_progress/at_border), 'done' shows delivered/cancelled ones.
async function openDealCard(page, { tabTestId }) {
  const myWork = page.locator('[data-testid="bottom-nav-mywork"]');
  await myWork.click();
  await page.waitForTimeout(1200);
  const tab = page.locator(`[data-testid="${tabTestId}"]`);
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  } else {
    await page.getByText(/В работе|Завершённые|In progress|Completed|工作中|已完成|Жұмыста|Аяқталған/i).first().click().catch(() => {});
  }
  await page.waitForTimeout(1200);
  const card = page.locator('[data-testid="my-order-card"]').first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  await page.waitForTimeout(2000);
}

test.describe('Trip status priority — deal.status over legacy tripState', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('in_progress deal: shows deal status, hides legacy "Запланирован" timeline', async ({ page }) => {
    await mockServer(page, { dealStatus: 'in_progress' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page, { tabTestId: 'my-work-tab-inwork' });

    const body = await page.locator('body').innerText();
    // Deal-status-driven timeline (DealStatusTimeline) must be present and
    // reflect in_progress — its current step + next-step hint.
    expect(body).toContain('Следующий шаг');
    // Legacy tripState timeline must be gone: it always renders "Запланирован"
    // for a real server trip (trip_state is never persisted), and showing it
    // next to an in_progress deal is exactly the bug being regression-tested.
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });

  test('at_border deal: still no legacy "Запланирован" leak', async ({ page }) => {
    await mockServer(page, { dealStatus: 'at_border' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page, { tabTestId: 'my-work-tab-inwork' });

    const body = await page.locator('body').innerText();
    expect(body).toContain('На границе');
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });

  test('accepted deal: DealStatusTimeline present, legacy block absent', async ({ page }) => {
    await mockServer(page, { dealStatus: 'accepted' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page, { tabTestId: 'my-work-tab-inwork' });

    const body = await page.locator('body').innerText();
    expect(body).toContain('Принят');
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });

  test('delivered deal: final status shown, legacy block absent', async ({ page }) => {
    await mockServer(page, { dealStatus: 'delivered' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page, { tabTestId: 'my-work-tab-done' });

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });
});

// ─── Scenario C: 409 on an invalid transition must not leave a stale
// action button — the screen must refetch and keep showing the real
// (unchanged) server status. ───────────────────────────────────────────────

test.describe('Deal status after a rejected (409) transition', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('at_border: rejected "mark delivered" keeps at_border, no accepted/start-delivery leak', async ({ page }) => {
    const box = await mockServerMutable(page, { initialStatus: 'at_border', statusChangeShouldFail: true });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page, { tabTestId: 'my-work-tab-inwork' });

    await expect(page.locator('[data-testid="deal-action-mark-arrived"]')).toBeVisible(); // at_border's only driver action

    await page.locator('[data-testid="deal-action-mark-arrived"]').first().click();
    await page.waitForTimeout(1500); // await the rejected PATCH + forced refetch

    // Server rejected the change — box.status never moved off at_border.
    expect(box.status).toBe('at_border');
    // The screen must reflect that: same action still offered, and the
    // accepted-state action must never leak in after a failed attempt.
    await expect(page.locator('[data-testid="deal-action-mark-arrived"]')).toBeVisible();
    await expect(page.locator('[data-testid="deal-action-start-delivery"]')).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Начать перевозку');
  });
});

// ─── Scenario D: a successful transition must update both the mock's
// authoritative state and the on-screen action button. ─────────────────────

test.describe('Deal status after a successful transition', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('accepted -> in_progress: "Начать перевозку" replaced by the next action', async ({ page }) => {
    const box = await mockServerMutable(page, { initialStatus: 'accepted', statusChangeShouldFail: false });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page, { tabTestId: 'my-work-tab-inwork' });

    let body = await page.locator('body').innerText();
    expect(body).toContain('Начать перевозку');

    await page.locator('[data-testid="deal-action-start-delivery"]').first().click();
    await page.waitForTimeout(1500); // await the successful PATCH + forced refetch

    expect(box.status).toBe('in_progress');
    // The accepted-state action button must be gone; international route
    // (KZ->UZ) means the next driver action is mark_at_border ("На границе").
    await expect(page.locator('[data-testid="deal-action-start-delivery"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="deal-action-mark-at-border"]')).toBeVisible();
    body = await page.locator('body').innerText();
    expect(body).not.toContain('Начать перевозку');
    expect(body).toContain('На границе');
  });
});
