/**
 * Non-destructive verification of the Deal/Order MVP UX.
 *
 * Strategy: intercept `/api/v1/market/my` and feed a synthetic deal so we
 * can assert that the bundle on the live (or local) site renders the new
 * order card, status labels, next-step hint and CTA buttons. No real
 * POST/PATCH ever leaves Playwright — all mutating endpoints are stubbed
 * back to ok:true to keep production data untouched.
 *
 * Local: E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/urtruck-deal-mvp.spec.js
 * Live:  E2E_BASE_URL=https://urtruck.kz   npx playwright test tests/e2e/urtruck-deal-mvp.spec.js
 */
const { test, expect } = require('@playwright/test');

test.skip(true, 'Superseded by RC2 FSM/runtime gates: driver no longer has legacy Deals/Orders tab; current coverage lives in urtruck-full-e2e-web D-flow, trip status priority specs, and backend FSM tests.');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz') + '/?v=deal-mvp';

const FAKE_USER = 'pw-driver-d1';
const FAKE_OWNER = 'pw-shipper-s1';
const FAKE_CARGO = 'cargo-pw-1';
const FAKE_DEAL  = 'deal-pw-1';
const FAKE_CHAT  = 'room-pw-1';

function makeDeal({ status = 'accepted', driverId = FAKE_USER, shipperId = FAKE_OWNER }) {
  return {
    id: FAKE_DEAL, cargo_id: FAKE_CARGO, trip_id: null, bid_id: 'bid-pw-1',
    shipper_id: shipperId, driver_id: driverId,
    from_city: 'Almaty', to_city: 'Moscow',
    amount: 4200, status, chat_room_id: FAKE_CHAT,
    created_at: '2026-05-02 10:00:00', updated_at: '2026-05-02 10:00:00',
  };
}

async function mockServer(page, { role = 'driver', dealStatus = 'accepted' } = {}) {
  const userId = role === 'driver' ? FAKE_USER : FAKE_OWNER;
  const driverId = FAKE_USER;
  const shipperId = FAKE_OWNER;

  await page.route('**/api/v1/register/guest', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, token: 'pw-tok', access_token: 'pw-tok',
        role, user_id: userId,
        user: { id: userId, role },
      }),
    });
  });
  await page.route('**/api/v1/register/me', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: userId, role, verification_level: 1 }),
    });
  });
  await page.route('**/api/v1/users/me**', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: userId, name: 'PW User', city: '', about: '' }),
    });
  });

  // Feed
  await page.route('**/api/v1/market/cargos**', async route => {
    if (route.request().url().includes('/cargos/' + FAKE_CARGO)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: FAKE_CARGO, owner_id: shipperId,
          from_city: 'Almaty', to_city: 'Moscow',
          cargo_desc: 'Pallets', cargo_type: 'general',
          weight_tons: 18, volume_m3: 80, truck_type: 'tent',
          price: 4200, status: 'taken', taken_by: driverId,
          bids_count: 1, created_at: '2026-05-02', photos: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        cargos: [{
          id: FAKE_CARGO, owner_id: shipperId,
          from_city: 'Almaty', to_city: 'Moscow',
          cargo_desc: 'Pallets', cargo_type: 'general',
          weight_tons: 18, volume_m3: 80, truck_type: 'tent',
          price: 4200, status: 'taken', taken_by: driverId,
          bids_count: 1, created_at: '2026-05-02',
        }],
        total: 1,
      }),
    });
  });
  await page.route('**/api/v1/market/trips**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [] }) });
  });
  await page.route('**/api/v1/market/drivers**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ drivers: [] }) });
  });
  await page.route('**/api/v1/market/bids**', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await page.route, await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        bids: [{
          id: 'bid-pw-1', cargo_id: FAKE_CARGO, trip_id: null,
          bidder_id: driverId, bidder_name: 'PW Driver', bidder_phone: '+77001110000',
          amount: 4200, message: null, status: dealStatus === 'cancelled' ? 'cancelled' : 'accepted',
          created_at: '2026-05-02 09:00:00', updated_at: '2026-05-02 09:30:00',
          counter_amount: null, counter_message: null, counter_by: null, counter_at: null,
        }],
      }),
    });
  });

  // The deal lives here.
  await page.route('**/api/v1/market/my', async route => {
    await page.route, await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        my_cargos: role === 'driver' ? [] : [{
          id: FAKE_CARGO, owner_id: shipperId,
          from_city: 'Almaty', to_city: 'Moscow', cargo_desc: 'Pallets',
          cargo_type: 'general', truck_type: 'tent',
          price: 4200, status: 'taken', bids_count: 1, photos: [],
          created_at: '2026-05-02', updated_at: '2026-05-02',
        }],
        my_trips: [], my_bids: [], incoming_bids: [],
        my_deals: [makeDeal({ status: dealStatus, driverId, shipperId })],
      }),
    });
  });
  await page.route('**/api/v1/market/deals/' + FAKE_DEAL, async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(makeDeal({ status: dealStatus, driverId, shipperId })),
    });
  });
  // Block ALL deal-status mutations so we never write to prod.
  await page.route('**/api/v1/market/deals/*/status**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'in_progress' }) });
  });
  await page.route('**/api/v1/reviews**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviews: [], summary: { count: 0, average: 0 } }) });
  });
  await page.route('**/api/v1/chat/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [], contacts: [], messages: [] }) });
  });
}

async function enterAsRole(page) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => {
    localStorage.setItem('ur_reg_token', 'pw-tok');
    localStorage.setItem('ur_session', JSON.stringify({ user: { id: 'pw-driver-d1', role: 'driver' } }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
}

async function gotoDealsList(page) {
  const tab = page.locator('[data-testid="bottom-nav-chats"], [data-testid="bottom-nav-deals"]').first();
  await tab.click();
  await page.waitForTimeout(1200);
  const active = page.locator('[data-testid="deals-tab-active"]').first();
  if (await active.isVisible().catch(() => false)) await active.click();
  await page.waitForTimeout(800);
}

// ─── RU baseline: full driver flow ──────────────────────────────────────────

test.describe('Deal MVP — RU driver', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('order card on Orders tab + click into CargoDetail (deal block)', async ({ page }) => {
    const consoleErrors = [];
    const networkErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('response', r => { if (r.status() >= 500) networkErrors.push(`${r.status()} ${r.url()}`); });

    await mockServer(page, { role: 'driver', dealStatus: 'accepted' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsRole(page);
    await gotoDealsList(page);

    // Order card visible with localized "ORDER" badge, status, route, amount.
    const card = page.locator('[data-testid="deals-deal-card"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    const cardText = await card.innerText();
    expect(cardText).toContain('ЗАКАЗ');
    expect(cardText).toContain('Almaty');
    expect(cardText).toContain('Moscow');
    expect(cardText).toMatch(/\$4\s*200|\$4200/);
    expect(cardText).toContain('Принят');                 // status_accepted
    expect(cardText).toContain('Следующий шаг');          // order_next_step
    expect(cardText).toContain('Сообщите когда выехали'); // driver_next_step_accepted
    expect(cardText).toContain('Чат по заказу');          // order_chat
    expect(cardText).toContain('Начать перевозку');       // start_delivery CTA

    // Click into CargoDetail — driver-side CTA must now appear because
    // role='driver' is passed via navigate params (no race with refreshLevel).
    await card.click();
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    expect(body).toContain('Принят');               // status header
    expect(body).toContain('Начать перевозку');     // driver CTA on accepted
    expect(body).toContain('Отменить сделку');      // cancel_deal
    expect(body).toContain('Чат по заказу');        // chat CTA
    expect(body).toContain('Сообщите когда выехали'); // driver_next_step_accepted hint
    // Filter out local-server-only 404s for sw.js / manifest.json.
    expect(consoleErrors.filter(e => !/favicon|webpush|Service Worker|404|File not found/i.test(e))).toEqual([]);
    expect(networkErrors).toEqual([]);
  });
});

// ─── RU shipper: in_progress flow on deal block ─────────────────────────────

test.describe('Deal MVP — RU shipper', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });

  test('shipper sees Confirm delivery on in_progress', async ({ page }) => {
    await mockServer(page, { role: 'driver' /* role here only flips guest payload; deal dictates side via shipper_id */, dealStatus: 'in_progress' });
    // Override /register/guest to be the shipper user so isShipper === true.
    await page.route('**/api/v1/register/guest', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: 'pw-tok', access_token: 'pw-tok',
          role: 'client', user_id: FAKE_OWNER, user: { id: FAKE_OWNER, role: 'client' } }),
      });
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.evaluate(() => {
      localStorage.setItem('ur_reg_token', 'pw-tok');
      localStorage.setItem('ur_session', JSON.stringify({ user: { id: 'pw-shipper-s1', role: 'client' } }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await gotoDealsList(page);
    const card = page.locator('[data-testid="deals-deal-card"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    const cardText = await card.innerText();
    expect(cardText).toContain('В пути');                  // status_in_progress
    expect(cardText).toContain('Подтвердите получение');   // shipper_next_step_in_progress
    expect(cardText).toContain('Подтвердить доставку');    // confirm_delivery CTA
    expect(cardText).toContain('Отменить сделку');
    expect(cardText).toContain('Чат по заказу');
  });
});

// ─── EN/CN/KZ no-Russian-leak in Orders tab ─────────────────────────────────

const RU_FORBIDDEN = [
  'Начать перевозку', 'Я доехал', 'Подтвердить доставку',
  'Отменить сделку', 'Чат по заказу', 'Следующий шаг',
  'Сообщите когда выехали', 'Принят', 'В пути',
  'Подтвердите получение груза',
];
const KZ_DISTINCT = ['Начать перевозку', 'Я доехал', 'Чат по заказу', 'Сообщите когда выехали'];

function assertNoRu(text, locale, list = RU_FORBIDDEN) {
  for (const ru of list) {
    expect(text, `Found Russian "${ru}" in ${locale}`).not.toContain(ru);
  }
}

test.describe('Deal MVP — EN locale', () => {
  test.use({ locale: 'en-US', timezoneId: 'America/New_York' });
  test('Orders tab renders English-only and deal block opens', async ({ page }) => {
    await mockServer(page, { role: 'driver', dealStatus: 'accepted' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsRole(page);
    await gotoDealsList(page);
    const ordersText = await page.locator('body').innerText();
    assertNoRu(ordersText, 'EN orders');
    expect(ordersText).toContain('ORDER');
    expect(ordersText).toContain('Accepted');
    expect(ordersText).toContain('Start delivery');
    expect(ordersText).toContain('Order chat');
    expect(ordersText).toContain('Notify when you depart');
    // Walk into CargoDetail. role='driver' from navigate params makes
    // driver-CTA appear immediately, no race with /register/me.
    const card = page.locator('[data-testid="deals-deal-card"]').first();
    await card.click();
    await page.waitForTimeout(2500);
    const detailText = await page.locator('body').innerText();
    assertNoRu(detailText, 'EN cargo detail');
    expect(detailText).toContain('Accepted');       // status header
    expect(detailText).toContain('Start delivery'); // driver CTA
    expect(detailText).toContain('Cancel order');   // cancel_deal
  });
});

test.describe('Deal MVP — CN locale', () => {
  test.use({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  // Known flaky: browser context closes during CN Orders navigation;
  // CN locale is still covered by locale-safe and cyrillic-leak tests.
  test.skip('Orders tab renders Chinese-only', async ({ page }) => {
    await mockServer(page, { role: 'driver', dealStatus: 'accepted' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsRole(page);
    await gotoDealsList(page);
    // Wait for /market/my mock to land and order card to render.
    await page.locator('[data-testid="deals-deal-card"]').first()
      .waitFor({ timeout: 15000 });
    const ordersText = await page.locator('body').innerText();
    assertNoRu(ordersText, 'CN orders');
    expect(ordersText).toContain('订单');
    expect(ordersText).toContain('已接受');
    expect(ordersText).toContain('开始运输');
    expect(ordersText).toContain('订单聊天');
  });
});

test.describe('Deal MVP — KZ locale', () => {
  test.use({ locale: 'kk-KZ', timezoneId: 'Asia/Almaty' });
  test('Orders tab and deal block render KZ-only (no RU leakage)', async ({ page }) => {
    await mockServer(page, { role: 'driver', dealStatus: 'accepted' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterAsRole(page);
    await gotoDealsList(page);
    const ordersText = await page.locator('body').innerText();
    assertNoRu(ordersText, 'KZ orders', KZ_DISTINCT);
    expect(ordersText).toContain('Тапсырыс');     // ORDER label / orders_tab
    expect(ordersText).toContain('Жеткізуді бастау'); // start_delivery
    expect(ordersText).toContain('Қабылданды');   // status_accepted
  });
});
