// React UI + только синтетические ответы; это не физическая и не QA2 приёмка.
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let server, base;
test.beforeAll(async () => {
  const dist = path.resolve(__dirname, '../../dist');
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.writeHead(503); return res.end(); }
    let file = path.resolve(dist, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(dist, 'index.html');
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', video: 'off', trace: 'off' });

async function boot(page, role = 'driver') {
  const user = { id: 'feed-fixture-' + role, role, verification_level: 3, basic_onboarding_completed: 1 };
  const box = { saved: false, fail: false, writes: 0, errors: [], feedQueries: [] };
  const item = { id: 'external-fixture', kind: role === 'driver' ? 'cargo' : 'vehicle', status: 'active', origin: 'Алматы', destination: 'Ташкент',
    original_text: 'Нужен тент. Груз готов', source_revision: 'fixture-revision', source_published_at: '2026-10-21T05:00:00Z', body_types: ['tent'], amount: 1500, currency: 'USD', price_state: 'known', contacts: ['+7 700 000 00 01'] };
  page.on('pageerror', error => box.errors.push(error.message));
  await page.addInitScript(user => {
    localStorage.setItem('ur_reg_token', 'synthetic-feed-token');
    localStorage.setItem('ur_session', JSON.stringify({ user }));
    localStorage.setItem('ur_verification_level', '3'); localStorage.setItem('ur_lang', 'RU');
  }, user);
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return route.abort();
    if (!u.pathname.startsWith('/api/')) return route.continue();
    let data = {};
    if (u.pathname === '/api/v1/register/me') data = user;
    else if (u.pathname === '/api/v1/users/me') data = { ...user, name: 'Тест ленты' };
    else if (u.pathname.endsWith('/external-fixture/bookmark')) {
      box.writes += 1;
      if (box.fail) { box.fail = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); }
      box.saved = route.request().method() === 'PUT'; data = { id: item.id, saved: box.saved };
    } else if (u.pathname === '/api/v1/external-freight') { box.feedQueries.push(Object.fromEntries(u.searchParams)); data = { items: u.searchParams.get('saved_only') === 'true' && !box.saved ? [] : [{ ...item, saved: box.saved }], next_cursor: null }; }
    else if (u.pathname.endsWith('/translate')) data = { translated_text: 'Truck needed. Cargo ready', source_revision: item.source_revision };
    else if (u.pathname.includes('/notifications')) data = { notifications: [], unread: 0 };
    else if (u.pathname.includes('/chat/')) data = { messages: [], rooms: [], unread: 0 };
    else if (u.pathname.endsWith('/market/my')) data = { my_cargos: [], my_trips: [], my_bids: [], incoming_bids: [], my_deals: [] };
    else if (u.pathname.endsWith('/market/my/listings')) data = { items: [], total: 0, archive_total: 0 };
    else if (u.pathname.includes('/market/cargos')) data = { cargos: [], total: 0 };
    else if (u.pathname.includes('/market/trips')) data = { trips: [], total: 0 };
    else if (u.pathname.includes('/favorites')) data = { favorites: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('bottom-nav')).toBeVisible({ timeout: 25000 });
  if (role === 'client') await page.getByTestId('bottom-nav-feed').click();
  await page.getByTestId('external-freight-entry').click();
  await expect(page.getByTestId('external-feed-card-external-fixture')).toBeVisible();
  return box;
}

for (const role of ['driver', 'client']) {
  test(role + ': bookmark survives reopening and saved-only unsave removes only bookmark', async ({ page }) => {
    const box = await boot(page, role);
    expect(await page.locator('[data-testid^="external-feed-filter-"]').count()).toBe(5);
    const button = page.getByTestId('external-feed-bookmark-external-fixture');
    await button.click();
    await expect(button).toHaveAttribute('aria-label', 'Убрать из сохранённых');
    await page.screenshot({ path: `test-results/external-feed-${role}-saved.png`, fullPage: true });
    await page.getByTestId('external-feed-back').click();
    await page.getByTestId('external-freight-entry').click();
    await expect(page.getByTestId('external-feed-bookmark-external-fixture')).toHaveAttribute('aria-label', 'Убрать из сохранённых');
    await page.getByTestId('external-feed-saved-only').click();
    await expect(page.getByTestId('external-feed-card-external-fixture')).toBeVisible();
    await page.getByTestId('external-feed-bookmark-external-fixture').click();
    await expect(page.getByTestId('external-feed-card-external-fixture')).toHaveCount(0);
    await page.getByTestId('external-feed-saved-only').click();
    await expect(page.getByTestId('external-feed-card-external-fixture')).toBeVisible();
    expect(box.writes).toBe(2); expect(box.errors).toEqual([]);
  });
}
test('failed save keeps unsaved state and allows retry', async ({ page }) => {
  const box = await boot(page);
  box.fail = true;
  const button = page.getByTestId('external-feed-bookmark-external-fixture');
  await button.click();
  await expect.poll(() => box.writes).toBe(1);
  await expect(button).toHaveAttribute('aria-label', 'Сохранить');
  await expect(page.getByText('Повторить', { exact: true }).filter({ visible: true })).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Убрать из сохранённых');
  expect(box.errors).toEqual([]);
});

test('route filters directly open visible search and distinguish country from city', async ({ page }) => {
  const box = await boot(page);
  await page.getByTestId('external-feed-filter-origin').click();
  const search = page.getByTestId('loc-search');
  await expect(search).toBeVisible();
  await expect(search).toBeInViewport();
  await expect(page.getByTestId('loc-geo')).toHaveCount(0);
  await search.fill('Китай');
  await page.getByTestId('loc-country-CN').click();
  await expect(page.getByTestId('external-feed-filter-origin')).toContainText('Китай');
  await expect.poll(() => box.feedQueries.at(-1)?.origin_country).toBe('CN');
  expect(box.feedQueries.at(-1).origin).toBeUndefined();
  await page.getByTestId('external-feed-filter-destination').click();
  await expect(page.getByTestId('loc-search')).toBeInViewport();
  await page.getByTestId('loc-search').fill('Ташкент');
  await page.getByTestId('loc-point-Ташкент').click();
  await expect.poll(() => box.feedQueries.at(-1)?.destination).toBe('Ташкент');
  expect(box.feedQueries.at(-1).destination_country).toBe('UZ');
  expect(box.errors).toEqual([]);
});
