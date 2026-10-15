// Только loopback/synthetic fixtures; никаких production API/данных.
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let server, base;
test.beforeAll(async () => {
  const dist = path.resolve(process.env.URTRUCK_CONFIRM_DIST || path.resolve(__dirname, '../../dist'));
  const mime = { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.writeHead(503); res.end('API must be intercepted'); return; }
    const relative = decodeURIComponent(req.url.split('?')[0]);
    let file = path.resolve(dist, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', video: 'off', trace: 'off' });

const DEAL = 'confirm-deal';
const ROOM = 'confirm-room';
async function fixture(page, { role, initialStatus = 'at_border', failFirst = false, lang = 'RU' }) {
  const user = { id: role === 'driver' ? 'confirm-driver' : 'confirm-client', role, verification_level: 3 };
  const box = { status: initialStatus, posts: [], errors: [], failFirst };
  const deal = () => ({
    id: DEAL, shipper_id: 'confirm-client', driver_id: 'confirm-driver',
    driver_name: 'Перевозчик', shipper_name: 'Отправитель',
    from_city: 'Ош', to_city: 'Поти', from_country: 'KG', to_country: 'GE',
    is_international: true, route_country_valid: true,
    cargo_id: null, trip_id: null, bid_id: 'confirm-bid', chat_room_id: ROOM,
    amount: 10000, currency: 'USD', cargo_desc: 'Мебель', status: box.status,
    created_at: '2026-10-15 00:00:00',
  });
  page.on('pageerror', error => box.errors.push(error.message));
  await page.addInitScript(({ user, lang }) => {
    localStorage.setItem('ur_reg_token', 'confirm-fixture-token');
    localStorage.setItem('ur_session', JSON.stringify({ user }));
    localStorage.setItem('ur_verification_level', '3');
    localStorage.setItem('ur_lang', lang);
  }, { user, lang });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let data = {};
    if (url.pathname === '/api/v1/register/me') data = user;
    else if (url.pathname === '/api/v1/users/me') data = { ...user, name: 'Проверка', city: 'Ош' };
    else if (url.pathname === '/api/v1/market/my') data = {
      my_cargos: [], my_trips: [], my_bids: [], incoming_bids: [], my_deals: [deal()],
    };
    else if (url.pathname === '/api/v1/market/my/listings') data = {
      items: [], total: 0, archive_total: 0, next_offset: null,
    };
    else if (url.pathname === '/api/v1/market/deals') data = { deals: [deal()] };
    else if (url.pathname === '/api/v1/market/deals/' + DEAL) data = deal();
    else if (url.pathname === '/api/v1/market/deals/' + DEAL + '/status') {
      const status = url.searchParams.get('new_status');
      box.posts.push(status);
      if (box.failFirst) {
        box.failFirst = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic status failure"}' });
      }
      box.status = status; data = { ok: true, status };
    } else if (url.pathname === '/api/v1/market/deals/' + DEAL + '/tracking') data = { ok: true, tracking: { status: 'stopped' } };
    else if (url.pathname === '/api/v1/chat/rooms') data = { rooms: [{
      id: ROOM, deal_id: DEAL, partner_id: role === 'driver' ? 'confirm-client' : 'confirm-driver',
      partner_name: 'Участник', partner_role: role === 'driver' ? 'client' : 'driver',
    }] };
    else if (url.pathname.endsWith('/timeline')) data = { events: [] };
    else if (url.pathname.includes('/chat/') && url.pathname.endsWith('/attachments')) data = { attachments: [] };
    else if (url.pathname.includes('/chat/')) data = { messages: [], rooms: [], unread: 0 };
    else if (url.pathname.includes('/notifications')) data = { notifications: [], unread: 0 };
    else if (url.pathname.includes('/favorites')) data = { favorites: [] };
    else if (url.pathname.includes('/reviews')) data = { ok: true, eligible: false, already_reviewed: true, reviews: [], summary: {} };
    else if (url.pathname.includes('/market/trips')) data = { trips: [], total: 0 };
    else if (url.pathname.includes('/market/cargos')) data = { cargos: [], total: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('bottom-nav-deals')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('bottom-nav-deals').click();
  await page.getByTestId('deals-tab-active').click();
  await expect(page.getByTestId('deals-deal-card')).toHaveCount(1);
  await page.getByTestId('deals-deal-card').click();
  await expect(page.getByTestId('deal-workspace-screen')).toBeVisible();
  await expect(page.getByTestId('deal-chat-input')).toBeVisible();
  return box;
}
const hosts = page => page.locator('[aria-modal="true"]');

for (const [role, initialStatus, action, target] of [
  ['driver', 'at_border', 'deal-action-mark-arrived', 'delivered'],
  ['client', 'delivered', 'deal-action-confirm-receipt', 'received'],
  ['client', 'received', 'deal-action-complete', 'completed'],
]) for (const lang of ['RU', 'EN', 'ZH']) {
  test(role + ' ' + lang + ': ' + initialStatus + ' → ' + target + ', один host/cancel/confirm', async ({ page }, testInfo) => {
    const box = await fixture(page, { role, initialStatus, lang });
    await page.getByTestId('deal-status-open').click();
    await expect(page.getByTestId('deal-status-panel')).toBeVisible();
    await page.getByTestId(action).click();
    await expect(page.getByTestId('deal-workspace-confirm')).toBeVisible();
    await expect(hosts(page)).toHaveCount(1);
    await expect(page.getByTestId('deal-status-panel')).toHaveCount(0);
    await page.getByTestId('deal-workspace-confirm-cancel').click();
    await expect(page.getByTestId('deal-status-panel')).toBeVisible();
    expect(box.posts).toEqual([]);
    await page.getByTestId(action).click();
    await expect(page.getByTestId('deal-workspace-confirm')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('deal-status-panel')).toBeVisible();
    expect(box.posts).toEqual([]);
    await page.getByTestId(action).click();
    await page.screenshot({ path: testInfo.outputPath('confirmation.png') });
    await page.getByTestId('deal-workspace-confirm-confirm').click();
    await expect.poll(() => box.status).toBe(target);
    expect(box.posts).toEqual([target]);
    await expect(page.getByTestId('deal-workspace-confirm')).toHaveCount(0);
    await expect(page.getByTestId(action)).toHaveCount(0);
    expect(box.errors).toEqual([]);
  });
}

test('driver RU: отказ503 виден, статус прежний, повтор после подтверждения работает', async ({ page }) => {
  const box = await fixture(page, { role: 'driver', failFirst: true });
  await page.getByTestId('deal-status-open').click();
  await page.getByTestId('deal-action-mark-arrived').click();
  await page.getByTestId('deal-workspace-confirm-confirm').click();
  await expect(page.getByText('Synthetic status failure', { exact: true })).toBeVisible();
  expect(box.status).toBe('at_border');
  await expect(page.getByTestId('deal-action-mark-arrived')).toBeEnabled();
  await page.getByTestId('deal-action-mark-arrived').click();
  await page.getByTestId('deal-workspace-confirm-confirm').click();
  await expect.poll(() => box.status).toBe('delivered');
  expect(box.posts).toEqual(['delivered', 'delivered']);
  expect(box.errors).toEqual([]);
});

for (const role of ['driver', 'client']) {
  test(role + ': отмена принятой сделки требует отдельного подтверждения', async ({ page }) => {
    const box = await fixture(page, { role, initialStatus: 'accepted' });
    await page.getByTestId('deal-status-open').click();
    await page.getByTestId('deal-cancel-link').click();
    await expect(hosts(page)).toHaveCount(1);
    await page.getByTestId('deal-workspace-confirm-cancel').click();
    expect(box.posts).toEqual([]);
    await page.getByTestId('deal-cancel-link').click();
    await page.getByTestId('deal-workspace-confirm-confirm').click();
    await expect.poll(() => box.status).toBe('cancelled');
    expect(box.posts).toEqual(['cancelled']);
    expect(box.errors).toEqual([]);
  });
}

test('client не получает действие delivered; карта без внешнего SDK сохраняет expand/chat/back', async ({ page }) => {
  const box = await fixture(page, { role: 'client' });
  await page.getByTestId('deal-status-open').click();
  await expect(page.getByTestId('deal-action-mark-arrived')).toHaveCount(0);
  await expect(page.getByTestId('deal-status-panel')).toBeVisible();
  await hosts(page).click({ position: { x: 5, y: 5 } });
  await expect(hosts(page)).toHaveCount(0);
  await page.getByTestId('deal-header-map').click();
  await expect(page.getByTestId('deal-map-fullscreen')).toBeVisible();
  await expect(hosts(page)).toHaveCount(0);
  const expand = page.getByTestId('deal-map-collapse');
  await expect(expand).toBeVisible();
  await expand.click(); await expect(expand).toContainText('Свернуть карту');
  await expect(hosts(page)).toHaveCount(0);
  await expand.click(); await expect(expand).toContainText('Развернуть карту');
  await page.getByTestId('deal-map-back').click();
  await expect(page.getByTestId('deal-chat-input')).toBeVisible();
  await page.getByTestId('deal-workspace-back').click();
  await expect(page.getByTestId('bottom-nav-deals')).toBeVisible();
  expect(box.posts).toEqual([]);
  expect(box.errors).toEqual([]);
});
