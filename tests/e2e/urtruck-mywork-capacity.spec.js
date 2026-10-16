// Только loopback + synthetic route fixtures. Реальный backend не запускается.
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let server, base;
test.beforeAll(async () => {
  const dist = path.resolve(__dirname, '../../dist');
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

for (const role of ['client', 'driver']) {
  test(role + ': 5000 своих объявлений, ошибка/повтор страницы и архив', async ({ page }, testInfo) => {
    test.setTimeout(480000);
    const user = { id: 'capacity-' + role, role, verification_level: 3, full_name: 'Capacity Fixture' };
    const kind = role === 'driver' ? 'trip' : 'cargo';
    const cardId = role === 'driver' ? 'my-trip-card' : 'my-cargo-card';
    const calls = [], errors = [], publicCalls = [];
    let failSecond = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ user }) => {
      localStorage.setItem('ur_reg_token', 'capacity-fixture-token');
      localStorage.setItem('ur_session', JSON.stringify({ user }));
      localStorage.setItem('ur_verification_level', '3');
      localStorage.setItem('ur_lang', 'RU');
    }, { user });
    const item = (i, status = 'active') => ({
      id: 'capacity-' + kind + '-' + i, owner_id: user.id, driver_id: user.id,
      from_city: 'Almaty', to_city: 'Astana', from_country: 'KZ', to_country: 'KZ',
      cargo_desc: kind === 'cargo' ? 'Мебель ' + i : undefined, cargo_type: 'tent', truck_type: 'tent',
      weight_tons: 20, capacity_tons: 20, volume_m3: 82, available_m3: 82,
      price: 10000, currency: 'KZT', pickup_date: '2099-01-01', departure: '2099-01-01',
      status, created_at: '2026-10-15 00:00:00', bids_count: 0,
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = {};
      if (url.pathname === '/api/v1/register/me') data = user;
      else if (url.pathname === '/api/v1/users/me') data = { ...user, name: user.full_name };
      else if (url.pathname === '/api/v1/market/my/listings') {
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || 50);
        const section = url.searchParams.get('section');
        calls.push({ offset, limit, section, kind: url.searchParams.get('kind') });
        if (offset === 50 && failSecond) {
          failSecond = false;
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"fixture transient"}' });
        }
        const total = section === 'archive' ? 70 : 5000;
        data = { items: Array.from({ length: Math.min(limit, Math.max(0, total - offset)) },
          (_, n) => item(offset + n, section === 'archive' ? 'unpublished' : 'active')),
          total, archive_total: 70, next_offset: offset + limit < total ? offset + limit : null };
      } else if (url.pathname === '/api/v1/market/my') {
        data = { my_trips: [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] };
      } else if (['/api/v1/market/trips', '/api/v1/market/cargos'].includes(url.pathname)) {
        const resource = url.pathname.endsWith('trips') ? 'trips' : 'cargos';
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || 50);
        publicCalls.push({ resource, offset, limit });
        data = { [resource]: Array.from({ length: Math.min(limit, Math.max(0, 251 - offset)) }, (_, i) => ({
          ...item(offset + i), id: 'public-' + (offset + i), owner_id: 'foreign', driver_id: 'foreign', cargo_desc: 'Мебель',
        })), total: Math.min(limit, Math.max(0, 251 - offset)), next_offset: offset + limit < 251 ? offset + limit : null,
        has_more: offset + limit < 251 };
      }
      else if (url.pathname.includes('/notifications/unread')) data = { unread: 0 };
      else if (url.pathname.includes('/notifications')) data = { notifications: [] };
      else if (url.pathname.includes('/favorites')) data = { favorites: [] };
      else if (url.pathname.includes('/chat/')) data = { rooms: [], contacts: [], messages: [], unread: 0 };
      else if (url.pathname.includes('/vehicles')) data = { ok: true, vehicles: [] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('bottom-nav-mywork')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('bottom-nav-mywork').click();
    await expect(page.getByTestId(cardId).first()).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const metrics = (await cdp.send('Performance.getMetrics')).metrics;
      return metrics.find(x => x.name === 'JSHeapUsedSize')?.value;
    };
    const initialHeap = await heap();
    const more = page.getByTestId('my-work-load-more');
    await more.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('mywork-first-50.png') });
    await expect(page.getByTestId('my-work-archive-toggle')).toContainText('(70)');
    await more.click();
    await expect(page.getByText('Ошибка загрузки', { exact: true })).toBeVisible();
    await expect(more).toContainText('Повторить');
    await more.click();
    await expect(page.getByText('Ошибка загрузки', { exact: true })).toHaveCount(0);
    await expect.poll(() => calls.filter(x => x.offset === 50).length).toBe(2);
    // В настоящий собранный UI передаются только страницы по 50.
    for (let offset = 100; offset < 5000; offset += 50) {
      await more.click();
      await expect.poll(() => calls.some(x => x.offset === offset && x.section === 'active')).toBe(true);
      if (offset < 4950) await expect(more).not.toHaveText('Загрузка…');
      else await expect(more).toHaveCount(0);
      if (offset % 1000 === 0) console.log(role, 'loaded', offset + 50);
    }
    await expect(more).toHaveCount(0);
    const mountedCards = await page.getByTestId(cardId).count();
    const loadedHeap = await heap();
    console.log(role, JSON.stringify({ mountedCards, initialHeap, loadedHeap }));
    expect(mountedCards).toBeLessThan(5000);
    expect(calls.every(x => x.limit === 50 && x.kind === kind)).toBe(true);
    await page.getByTestId('my-work-archive-toggle').click();
    await expect(page.getByTestId('republish-btn').first()).toBeVisible();
    await expect(more).toContainText('Показать ещё');
    await more.click();
    await expect(more).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('archive-70.png') });
    await page.getByTestId('bottom-nav-feed').click();
    const publicScreen = page.getByTestId(role === 'driver' ? 'cargo-screen' : 'trip-feed-screen');
    await publicScreen.scrollIntoViewIfNeeded();
    await expect(page.getByTestId(role === 'driver' ? 'cargo-card-public-0' : 'trip-card-public-0')).toBeVisible();
    const hasFeedScroller = await publicScreen.evaluate((screen) => {
      const nodes = [screen, ...screen.querySelectorAll('*')];
      const node = nodes.find((item) => {
        const style = getComputedStyle(item);
        const hasCards = item.querySelector('[data-testid^="trip-card-"], [data-testid^="cargo-card-"]');
        return hasCards && item.scrollHeight > item.clientHeight + 1 && /(auto|scroll)/.test(style.overflowY);
      });
      if (!node) return false;
      node.setAttribute('data-qa-public-feed-scroller', 'true');
      return true;
    });
    expect(hasFeedScroller).toBe(true);
    const feedScroller = publicScreen.locator('[data-qa-public-feed-scroller="true"]');
    for (let offset = 50; offset <= 250; offset += 50) {
      for (let attempt = 0; attempt < 20 && !publicCalls.some(x => x.offset === offset); attempt++) {
        await feedScroller.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
          node.dispatchEvent(new Event('scroll', { bubbles: true }));
        });
        await page.waitForTimeout(100);
      }
      expect(publicCalls.some(x => x.offset === offset), JSON.stringify(publicCalls)).toBe(true);
    }
    expect(publicCalls.some(x => x.offset > 250)).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('public-feed-after-251.png') });
    await testInfo.attach('capacity-observations', { body: JSON.stringify({ role,
      active_pages: calls.filter(x => x.section === 'active').length, mountedCards, initialHeap, loadedHeap, calls, publicCalls }),
      contentType: 'application/json' });
  });
}
