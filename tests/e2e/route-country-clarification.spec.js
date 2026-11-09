// Только loopback и синтетические аккаунты. Production-запросы запрещены.
const { test, expect } = require('@playwright/test');
const { dismissFirstVisit } = require('./helpers/webflow');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let server, base;
test.beforeAll(async () => {
  const dist = path.resolve(__dirname, '../../dist');
  const mime = { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.writeHead(503); res.end(); return; }
    let file = path.resolve(dist, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, video: 'off', trace: 'off' });

function box(mode = 'listing') {
  return { mode, from: 'XX', to: 'IR', pending: null, applied: null, posts: [], errors: [], fail: false };
}

async function boot(page, state, role = 'client') {
  const user = { id: role === 'client' ? 'route-owner' : 'route-driver', role, verification_level: 3, basic_onboarding_completed: true };
  const cargo = () => ({ id: 'route-cargo', owner_id: 'route-owner', from_city: 'Существующий пункт', to_city: 'Пункт назначения',
    from_country: state.from, to_country: state.to, cargo_desc: 'Оборудование', cargo_type: 'tent', price: 900, currency: 'USD',
    status: 'active', published_at: new Date().toISOString(), created_at: new Date().toISOString(), bids_count: 0 });
  const deal = () => ({ id: 'route-deal', shipper_id: 'route-owner', driver_id: 'route-driver', cargo_id: 'route-cargo',
    bid_id: 'route-bid', chat_room_id: 'route-room', from_city: 'Существующий пункт', to_city: 'Пункт назначения',
    from_country: state.from, to_country: state.to, amount: 900, currency: 'USD', status: 'in_progress',
    route_country_valid: state.from !== 'XX', is_international: state.from === 'XX' ? null : true,
    route_country_clarification: { pending: state.pending, applied: state.applied,
      can_propose: user.id === 'route-owner' && state.from === 'XX', can_confirm: user.id === 'route-driver' && !!state.pending } });
  page.on('pageerror', e => state.errors.push(e.message));
  await page.addInitScript(user => {
    if (localStorage.getItem('ur_reg_token')) return;
    localStorage.setItem('ur_reg_token', 'synthetic-' + user.id);
    localStorage.setItem('ur_session', JSON.stringify({ user }));
    localStorage.setItem('ur_verification_level', '3');
    localStorage.setItem('ur_lang', 'RU');
    localStorage.setItem('ur_external_feed_first_visit_v1:' + user.id, '1');
  }, user);
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const p = url.pathname; let data = {};
    if (request.method() === 'POST' && p.includes('/route-country')) {
      const body = request.postDataJSON();
      state.posts.push({ path: p, body, actor: user.id });
      if (state.fail) { state.fail = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"temporary"}' }); }
      if (p.endsWith('/confirm')) {
        if (!state.pending || !p.includes('/' + state.pending.id + '/confirm')) return route.fulfill({ status: 409, contentType: 'application/json', body: '{"detail":{"error":"ROUTE_PROPOSAL_STALE"}}' });
        state.applied = { ...state.pending, status: 'applied', approver_id: user.id };
        state.from = state.pending.from_country_after; state.to = state.pending.to_country_after; state.pending = null;
        data = { ok: true, clarification: state.applied };
      } else if (state.mode === 'listing') {
        state.from = body.from_country; state.to = body.to_country;
        data = { ok: true, clarification: { id: 'listing-change', status: 'applied' } };
      } else {
        state.pending = { id: 'proposal-' + state.posts.length, proposer_id: user.id,
          from_country_before: state.from, to_country_before: state.to,
          from_country_after: body.from_country, to_country_after: body.to_country, status: 'pending' };
        data = { ok: true, clarification: state.pending };
      }
    } else if (p.endsWith('/register/me')) data = user;
    else if (p.endsWith('/users/me')) data = { ...user, name: 'Проверка маршрута' };
    else if (p.endsWith('/market/my')) data = { my_cargos: state.mode === 'listing' ? [cargo()] : [], my_trips: [], my_bids: [], incoming_bids: [], my_deals: state.mode === 'deal' ? [deal()] : [] };
    else if (p.endsWith('/market/my/listings')) data = { items: state.mode === 'listing' && url.searchParams.get('section') === 'active' ? [cargo()] : [], total: state.mode === 'listing' ? 1 : 0, archive_total: 0, history_total: 0, next_offset: null };
    else if (p.endsWith('/market/deals/route-deal')) data = deal();
    else if (p.endsWith('/market/deals')) data = { deals: [deal()] };
    else if (p.endsWith('/tracking')) data = { ok: true, tracking: { status: 'stopped' } };
    else if (p.endsWith('/chat/rooms')) data = { rooms: state.mode === 'deal' ? [{ id: 'route-room', deal_id: 'route-deal', partner_id: role === 'client' ? 'route-driver' : 'route-owner', partner_name: 'Участник', partner_role: role === 'client' ? 'driver' : 'client' }] : [] };
    else if (p.includes('/chat/')) data = { messages: [], rooms: [], unread: 0, attachments: [] };
    else if (p.includes('/notifications')) data = { notifications: [], unread: 0 };
    else if (p.includes('/external-freight/count')) data = { count: 0, offer_count: 0, carrier_count: 0, kind: role === 'client' ? 'vehicle' : 'cargo' };
    else if (p.includes('/market/cargos')) data = { cargos: [], total: 0, has_more: false, search_contract: 1 };
    else if (p.includes('/market/trips')) data = { trips: [], total: 0, has_more: false, search_contract: 1 };
    else if (p.includes('/reviews')) data = { eligible: false, reviews: [] };
    else if (p.endsWith('/timeline')) data = { events: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await dismissFirstVisit(page);
  return state;
}

async function cargoForm(page) {
  await page.getByTestId('bottom-nav-mywork').click();
  await page.getByTestId('my-cargo-edit-btn').click();
  await page.getByTestId('route-country-open-cargo').click();
  await expect(page.getByTestId('route-country-form')).toBeVisible();
  await expect(page.getByTestId('route-country-save')).toBeEnabled();
}
async function selectFrom(page, country = 'KZ') {
  await page.getByTestId('route-country-from').click();
  await page.getByTestId('country-row-' + country).click();
  await expect(page.getByTestId('route-country-form')).toBeVisible();
}
async function openDeal(page) {
  await page.getByTestId('bottom-nav-deals').click();
  await expect(page.getByTestId('deals-tab-active')).toContainText('1');
  await page.getByTestId('deals-tab-active').click();
  await page.getByTestId('deals-deal-card').click();
  await expect(page.getByTestId('deal-workspace-screen')).toBeVisible();
  await page.getByTestId('route-country-open-deal').click();
  await expect(page.getByTestId('route-country-form')).toBeVisible();
}

test('владелец выбирает страну явно;503 сохраняет выбор и retry не меняет ID запроса', async ({ page }) => {
  const state = await boot(page, box()); state.fail = true;
  await page.getByTestId('bottom-nav-mywork').click();
  await page.getByTestId('my-cargo-edit-btn').click();
  await page.getByTestId('edit-cargo-price').fill('1200');
  await page.getByTestId('route-country-open-cargo').click();
  await expect(page.getByTestId('route-country-from')).not.toContainText('Казахстан');
  await selectFrom(page);
  await expect(page.getByTestId('route-country-to')).toBeDisabled();
  await page.getByTestId('route-country-save').click();
  await expect(page.getByTestId('route-country-error')).toBeVisible();
  await expect(page.getByTestId('route-country-from')).toContainText('Казахстан');
  await page.getByTestId('route-country-save').click();
  await expect(page.getByTestId('route-country-form')).not.toBeVisible();
  await expect(page.getByTestId('edit-cargo-price')).toHaveValue('1200');
  expect(state.posts).toHaveLength(2);
  expect(state.posts[0].body).toEqual(state.posts[1].body);
  expect(state.from).toBe('KZ'); expect(state.errors).toEqual([]);
});

test('неотправленный выбор страны переживает перезапуск, без автоматического POST', async ({ page }) => {
  const state = await boot(page, box());
  await page.getByTestId('bottom-nav-mywork').click();
  await page.getByTestId('my-cargo-edit-btn').click();
  await page.getByTestId('route-country-open-cargo').click();
  await selectFrom(page);
  await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([k,v]) => k.includes('route-country') && v.includes('KZ')))).toBe(true);
  await page.reload(); await dismissFirstVisit(page);
  await page.getByTestId('bottom-nav-mywork').click(); await page.getByTestId('my-cargo-edit-btn').click();
  await page.getByTestId('route-country-open-cargo').click();
  await expect(page.getByTestId('route-country-from')).toContainText('Казахстан');
  expect(state.posts).toEqual([]); expect(state.errors).toEqual([]);
});

test('принятая сделка меняется только после явного подтверждения другой стороной', async ({ page, browser }) => {
  const state = await boot(page, box('deal'));
  await openDeal(page); await selectFrom(page);
  await page.getByTestId('route-country-save').click();
  await expect.poll(() => !!state.pending).toBe(true);
  expect(state.from).toBe('XX');
  await page.getByTestId('route-country-open-deal').click();
  await expect(page.getByTestId('route-country-confirm')).toHaveCount(0);
  await page.getByTestId('route-country-close').click();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  try {
    const driver = await context.newPage(); await boot(driver, state, 'driver');
    await openDeal(driver);
    await expect(driver.getByTestId('route-country-from')).toContainText('Казахстан');
    await expect(driver.getByTestId('route-country-from')).toBeDisabled();
    const shownId = state.pending.id;
    await driver.getByTestId('route-country-confirm').click();
    await expect.poll(() => state.from).toBe('KZ');
    expect(state.posts.at(-1).path).toContain('/' + shownId + '/confirm');
    expect(state.applied.approver_id).toBe('route-driver');
    expect(state.errors).toEqual([]);
  } finally { await context.close(); }
});

test('высокий шрифт и маленький экран не прячут сохранение и возврат', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const state = await boot(page, box());
  await page.getByTestId('bottom-nav-mywork').click(); await page.getByTestId('my-cargo-edit-btn').click();
  await page.getByTestId('route-country-open-cargo').click();
  await page.getByTestId('route-country-form').evaluate(el => { for (const text of el.querySelectorAll('div')) if (text.textContent) text.style.fontSize = '25px'; });
  await page.getByTestId('route-country-save').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('route-country-save')).toBeInViewport();
  await page.getByTestId('route-country-close').click();
  await expect(page.getByTestId('edit-cargo-price')).toBeVisible();
  expect(state.posts).toEqual([]); expect(state.errors).toEqual([]);
});


test('legacy-название известной страны заблокировано, полный список включает AX', async ({ page }) => {
  const state = box(); state.from = 'Казахстан'; state.to = 'XX';
  await boot(page, state);
  await page.getByTestId('bottom-nav-mywork').click(); await page.getByTestId('my-cargo-edit-btn').click();
  await page.getByTestId('route-country-open-cargo').click();
  await expect(page.getByTestId('route-country-from')).toContainText('Казахстан');
  await expect(page.getByTestId('route-country-from')).toBeDisabled();
  await page.getByTestId('route-country-to').click();
  await page.getByTestId('country-picker-search').fill('AX');
  await expect(page.getByTestId('country-row-AX')).toBeVisible();
  await page.getByTestId('country-row-AX').click();
  await page.getByTestId('route-country-save').click();
  await expect.poll(() => state.to).toBe('AX');
  expect(state.posts[0].body.from_country).toBe('KZ');
  expect(state.errors).toEqual([]);
});
