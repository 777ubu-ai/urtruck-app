/**
 * Regression: deal.status must be the single source of truth for a trip's
 * status display, and status-change actions must live in exactly one place.
 *
 * History:
 * - Original bug (PR2 visual review, 04.08.2026): TripDetail rendered BOTH
 *   the legacy local trip.tripState timeline (always frozen on "Запланирован"
 *   — the backend never persists trip_state) AND the deal-status-driven
 *   DealStatusTimeline at the same time, so an in_progress/at_border deal
 *   still showed "Запланирован" as the active step.
 * - 05.08.2026 (owner decision, WhatsApp-style unification): CargoDetail/
 *   TripDetail/MyTripsScreen used to each have their OWN copy of the status-
 *   progression buttons (Начать перевозку/На границе/Груз доставлен/
 *   Подтвердить получение) — three independent places acting on the same
 *   deal.status. DealStatusTimeline (the horizontal stepper) is gone from
 *   both CargoDetail and TripDetail, replaced by a compact "Текущий статус"
 *   block; the action buttons now live ONLY in ChatScreen
 *   (the deal's conversation) — reached via the unified «Сделки» list
 *   (ChatsListScreen dealsMode), not via MyTripsScreen tabs (which no longer
 *   have deal-derived tabs at all — see MyTripsScreen.js commit history).
 *
 * Local: E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/urtruck-trip-deal-status-priority.spec.js
 * Live:  E2E_BASE_URL=https://urtruck.kz   npx playwright test tests/e2e/urtruck-trip-deal-status-priority.spec.js
 */
const { test, expect } = require('@playwright/test');
const H = require('./helpers/webflow');

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

// from_country/to_country (05.08.2026): GET /market/deals/{id} now enriches
// the deal with the trip's/cargo's route countries (backend/api/marketplace.py
// get_deal()) — ChatScreen needs them to pick the right next-action button
// (domestic vs international route). Omitting them here would make every
// test see dealHasCountries=false, which is not what production sends.
function makeDeal(status) {
  return {
    id: DEAL_ID, cargo_id: null, trip_id: TRIP_ID, bid_id: 'bid-pw-tds1',
    shipper_id: SHIPPER_ID, driver_id: DRIVER_ID,
    from_city: 'Almaty', to_city: 'Tashkent',
    from_country: 'KZ', to_country: 'UZ',
    is_international: true, route_country_valid: true,
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
  await page.route('**/api/v1/market/deals/' + DEAL_ID + '/tracking', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tracking: { status: 'active' } }) });
  });
  await page.route('**/api/v1/market/deals/*/status**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: dealStatus }) });
  });
  await page.route('**/api/v1/deals/**/timeline', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) });
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
  // Registered after the wildcard so it wins for this specific path (Playwright
  // matches the most-recently-registered route first): ChatScreen reverse-
  // resolves dealId from roomId via GET /chat/rooms when navigated to with
  // only { roomId } (e.g. TripDetail's/CargoDetail's "💬 Чат" link, which
  // never passes dealId directly) — without a matching room here, dealId
  // never resolves and the deal card/status/action buttons never render.
  await page.route('**/api/v1/chat/rooms**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ rooms: [{
        id: CHAT_ID, deal_id: DEAL_ID, cargo_id: null, trip_id: TRIP_ID,
        partner_id: SHIPPER_ID, partner_name: 'PW Shipper', partner_role: 'client',
      }] }),
    });
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
  await page.route('**/api/v1/market/deals/' + DEAL_ID + '/tracking', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tracking: { status: 'active' } }) });
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
  await page.route('**/api/v1/deals/**/timeline', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) });
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
  // Registered after the wildcard so it wins for this specific path (Playwright
  // matches the most-recently-registered route first): ChatScreen reverse-
  // resolves dealId from roomId via GET /chat/rooms when navigated to with
  // only { roomId } (e.g. TripDetail's/CargoDetail's "💬 Чат" link, which
  // never passes dealId directly) — without a matching room here, dealId
  // never resolves and the deal card/status/action buttons never render.
  await page.route('**/api/v1/chat/rooms**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ rooms: [{
        id: CHAT_ID, deal_id: DEAL_ID, cargo_id: null, trip_id: TRIP_ID,
        partner_id: SHIPPER_ID, partner_name: 'PW Shipper', partner_role: 'client',
      }] }),
    });
  });
  return box;
}

// Skip onboarding/auth/role-select entirely by seeding a token directly —
// AuthContext resolves hasToken/session/hasRole from /register/me (mocked
// above to return role:'driver'), landing straight on the driver tab bar.
async function enterAsDriver(page) {
  await H.emailLogin(page, `tds-${Date.now()}@urtruck.kz`, 'driver', { name: 'PW Driver', city: 'Almaty' });
  await page.waitForTimeout(3000);
}

// RC2: deals no longer live under MyTripsScreen tabs. Driver has a dedicated
// Chats tab, and each accepted deal appears there as a protected deal room.
async function openDealCard(page) {
  const deals = page.locator('[data-testid="bottom-nav-chats"], [data-testid="bottom-nav-deals"]').first();
  await deals.click();
  await page.waitForTimeout(1200);
  const card = page.locator('[data-testid="deal-room-list-card"], [data-testid="deals-deal-card"]').first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  await page.waitForTimeout(2000);
}

// The status-progression action buttons (05.08.2026) live only inside the
// deal's conversation now — open it via TripDetail's "💬 Чат" link.
async function openDealChat(page) {
  if (await page.getByText('Текущий статус').first().isVisible().catch(() => false)) {
    return;
  }
  const chatLink = page.locator('[data-testid="deal-order-chat"]').first();
  await expect(chatLink).toBeVisible({ timeout: 10000 });
  await chatLink.click();
  await page.waitForTimeout(1500);
}

test.describe('Trip status priority — deal.status over legacy tripState', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('in_progress deal: shows deal status, hides legacy "Запланирован" timeline', async ({ page }) => {
    await mockServer(page, { dealStatus: 'in_progress' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);

    const body = await page.locator('body').innerText();
    // Compact status block (replaces the old DealStatusTimeline stepper,
    // 05.08.2026) must be present and reflect in_progress via its
    // compact authoritative status block.
    expect(body).toContain('Текущий статус');
    // Legacy tripState timeline must be gone: it always renders "Запланирован"
    // for a real server trip (trip_state is never persisted), and showing it
    // next to an in_progress deal is exactly the bug being regression-tested.
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });

  test('at_border deal: shows the required border stage, no legacy "Запланирован" leak', async ({ page }) => {
    await mockServer(page, { dealStatus: 'at_border' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);

    const body = await page.locator('body').innerText();
    expect(body).toContain('На границе');
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });

  test('accepted deal: compact status shown, legacy block absent', async ({ page }) => {
    await mockServer(page, { dealStatus: 'accepted' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);

    const body = await page.locator('body').innerText();
    expect(body).toContain('Принят');
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });

  test('delivered deal: final status shown, legacy block absent', async ({ page }) => {
    await mockServer(page, { dealStatus: 'delivered' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Запланирован');
    expect(body).not.toContain('Статус рейса');
  });
});

// ─── Scenario C: 409 on an invalid transition must not leave a stale
// action button — the screen must refetch and keep showing the real
// (unchanged) server status. Action buttons live in the deal's chat now. ──

test.describe('Deal status after a rejected (409) transition', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('at_border: rejected "mark delivered" keeps at_border, no accepted/start-delivery leak', async ({ page }) => {
    const box = await mockServerMutable(page, { initialStatus: 'at_border', statusChangeShouldFail: true });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);
    await openDealChat(page);

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
    expect(body).not.toContain('Начать');
  });
});

// ─── Scenario D: a successful transition must update both the mock's
// authoritative state and the on-screen action button. ─────────────────────

test.describe('Deal status after a successful transition', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('accepted -> in_progress: "Начать" replaced by the next action', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'], { origin: new URL(BASE).origin });
    await context.setGeolocation({ latitude: 43.238949, longitude: 76.889709 });
    const box = await mockServerMutable(page, { initialStatus: 'accepted', statusChangeShouldFail: false });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);
    await openDealChat(page);

    let body = await page.locator('body').innerText();
    expect(body).toContain('Начать');

    await page.locator('[data-testid="deal-action-start-delivery"]').first().click();
    await page.waitForTimeout(1500); // await the successful PATCH + forced refetch

    expect(box.status).toBe('in_progress');
    // The accepted-state action button must be gone. International routes
    // must expose the border step required by the backend FSM.
    await expect(page.locator('[data-testid="deal-action-start-delivery"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="deal-action-mark-at-border"]')).toBeVisible();
    await expect(page.locator('[data-testid="deal-action-mark-arrived"]')).toHaveCount(0);
    body = await page.locator('body').innerText();
    expect(body).toContain('Прибыл на границу');
  });
});

// ─── Scenario E: leaving the deal chat (back to the list) and reopening it
// must re-fetch the deal, never fall back to a stale/initial 'accepted'. ──

test.describe('Deal status survives navigating away and back', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('at_border: back to list then reopen still shows at_border, not accepted', async ({ page }) => {
    await mockServerMutable(page, { initialStatus: 'at_border', statusChangeShouldFail: false });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);
    await openDealChat(page);

    await expect(page.locator('[data-testid="deal-action-mark-arrived"]')).toBeVisible();
    await expect(page.locator('[data-testid="deal-action-start-delivery"]')).toHaveCount(0);

    // Force a full reload (strictly stronger than a "back" tap — guarantees
    // every component fully unmounts, so nothing can survive in memory) and
    // reopen the SAME deal from the unified list from scratch. The status
    // must come fresh from the server on this new mount, not from a
    // leftover navigation param or stale in-memory default.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await openDealCard(page);
    await openDealChat(page);

    await expect(page.locator('[data-testid="deal-action-mark-arrived"]')).toBeVisible();
    await expect(page.locator('[data-testid="deal-action-start-delivery"]')).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body).toContain('На границе');
  });
});

// ─── Narrow screen: the compact status block (05.08.2026) replaced the old
// 4-step DealStatusTimeline that used to overlap on narrow widths — verify
// it still renders intelligibly at 340px with no console errors. ──────────

test.describe('Compact deal status on a narrow screen', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('width=340px: in_progress deal shows compact status, no console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

    await page.setViewportSize({ width: 340, height: 800 });
    await mockServer(page, { dealStatus: 'in_progress' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsDriver(page);
    await openDealCard(page);

    const body = await page.locator('body').innerText();
    expect(body).toContain('В работе');
    expect(body).toContain('Текущий статус');

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  });
});
