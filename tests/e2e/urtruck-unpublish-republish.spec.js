// Решение владельца 07.11: история без ручной повторной публикации.
// Изолированный UI с синтетическими данными, без запросов к живым средам.
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let server, base;
test.beforeAll(async () => {
  const dist = path.resolve(__dirname, '../../dist');
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.writeHead(503); res.end(); return; }
    let file = path.resolve(dist, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(dist + path.sep)) file = path.join(dist, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(dist, 'index.html');
    const mime = { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', video: 'off', trace: 'off' });
for (const role of ['client', 'driver']) {
  test(role + ': вся история компактна, статусы сохраняются, ручного восстановления нет', async ({ page }, testInfo) => {
    const user = { id: 'history-' + role, role, verification_level: 3, full_name: 'History Fixture' };
    const states = ['unpublished', 'cancelled', 'completed', 'expired', role === 'driver' ? 'booked' : 'taken'];
    const history = states.map((status, i) => ({ id: 'history-' + i, owner_id: user.id, driver_id: user.id,
      from_city: 'Almaty', to_city: 'Astana', from_country: 'KZ', to_country: 'KZ', status,
      cargo_desc: role === 'client' ? 'Мебель' : undefined, cargo_type: 'tent', truck_type: 'tent',
      price: 5000, currency: 'USD', created_at: '2026-10-15', pickup_date: '2026-10-16', departure: '2026-10-16' }));
    const mutations = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ user }) => {
      localStorage.setItem('ur_reg_token', 'history-fixture-token');
      localStorage.setItem('ur_session', JSON.stringify({ user }));
      localStorage.setItem('ur_verification_level', '3');
      localStorage.setItem('ur_lang', 'RU');
    }, { user });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (!['GET', 'HEAD'].includes(route.request().method())) mutations.push(url.pathname);
      let data = {};
      if (url.pathname === '/api/v1/register/me') data = user;
      else if (url.pathname === '/api/v1/users/me') data = { ...user, name: user.full_name };
      else if (/\/market\/cargos\/history-\d+\/bids$/.test(url.pathname)) data = { bids: [], count: 0, is_owner: true };
      else if (/\/market\/cargos\/history-\d+$/.test(url.pathname)) data = history.find(item => url.pathname.endsWith('/' + item.id));
      else if (url.pathname === '/api/v1/market/my/listings') {
        const items = url.searchParams.get('section') === 'history' ? history : [];
        data = { items, total: items.length, archive_total: 2, history_total: history.length, next_offset: null };
      } else if (url.pathname === '/api/v1/market/my') data = { my_trips: [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] };
      else if (url.pathname.includes('/notifications/unread')) data = { unread: 0 };
      else if (url.pathname.includes('/notifications')) data = { notifications: [] };
      else if (url.pathname.includes('/chat/')) data = { rooms: [], contacts: [], messages: [] };
      else if (url.pathname.includes('/trips')) data = { trips: [], total: 0 };
      else if (url.pathname.includes('/cargos')) data = { cargos: [], total: 0 };
      else if (url.pathname.includes('/vehicles')) data = { ok: true, vehicles: [] };
      else if (url.pathname.includes('/favorites')) data = { favorites: [] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByTestId('bottom-nav-mywork').click();
    await expect(page.getByTestId('my-work-archive-toggle')).toContainText('(5)');
    await page.getByTestId('my-work-archive-toggle').click();
    await expect(page.getByTestId('my-history-card')).toHaveCount(5);
    for (const label of ['Снято с публикации', 'Отменён', 'Завершён']) {
      await expect(page.getByTestId('my-work-screen')).toContainText(label);
    }
    for (const id of ['republish-btn', 'extend-oneclick-btn', 'extend-editdate-btn']) await expect(page.getByTestId(id)).toHaveCount(0);
    const box = await page.getByTestId('my-history-card').first().boundingBox();
    expect(box.height).toBeLessThan(135);
    // Завершить существующее каскадное появление карточек перед визуальным снимком.
    await page.waitForTimeout(900);
    await page.screenshot({ path: testInfo.outputPath('compact-history.png') });
    await page.getByTestId('my-work-archive-toggle').click();
    await expect(page.getByTestId('my-history-card')).toHaveCount(0);
    await page.getByTestId('my-work-archive-toggle').click();
    await expect(page.getByTestId('my-history-card')).toHaveCount(5);
    if (role === 'client') {
      for (const index of [0, 3]) {
        await page.getByTestId('my-history-card').nth(index).click();
        await expect(page.getByTestId('cargo-share-btn')).toBeVisible();
        await expect(page.getByText('Удалить мой груз', { exact: false })).toHaveCount(0);
        await page.getByTestId('brand-back').click();
        await expect(page.getByTestId('my-history-card')).toHaveCount(5);
      }
    }
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
