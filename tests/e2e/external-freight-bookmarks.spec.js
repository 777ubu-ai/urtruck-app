// React UI + только синтетические ответы; это не физическая и не QA2 приёмка.
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let server, base;
test.beforeAll(async () => {
  const dist = process.env.EXTERNAL_FEED_TEST_DIST || path.resolve(__dirname, '../../dist');
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

async function boot(page, role = 'driver', options = {}) {
  const user = { id: 'feed-fixture-' + role, role, verification_level: 3, basic_onboarding_completed: 1 };
  const box = { saved: false, fail: false, writes: 0, errors: [], feedQueries: [], businessWrites: [], aiRequests: [] };
  const item = { id: 'external-fixture', kind: role === 'driver' ? 'cargo' : 'vehicle', status: 'active', origin: 'Алматы', destination: 'Ташкент',
    original_text: options.text ?? Array.from({ length: 16 }, (_, i) => `Условие ${i + 1}: нужен тент, груз готов, документы на погрузке.`).join('\n'), source_revision: 'fixture-revision', source_published_at: '2026-10-21T05:00:00Z', body_types: ['tent'], amount: 1500, currency: 'USD', price_state: 'known', contacts: ['+7 700 000 00 01'], ...options.item };
  page.on('pageerror', error => box.errors.push(error.message));
  await page.addInitScript(user => {
    localStorage.setItem('ur_reg_token', 'synthetic-feed-token');
    localStorage.setItem('ur_session', JSON.stringify({ user }));
    localStorage.setItem('ur_verification_level', '3'); localStorage.setItem('ur_lang', 'RU');
  }, user);
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== base && u.origin !== "https://qa2.urtruck.kz") return route.abort();
    if (u.pathname.includes("/market/") && route.request().method() !== "GET") box.businessWrites.push(u.pathname);
    if (u.pathname.includes("translate") || u.pathname.includes("/ai/")) box.aiRequests.push(u.pathname);
    if (!u.pathname.startsWith('/api/')) return route.continue();
    let data = {};
    if (u.pathname === '/api/v1/register/me') data = user;
    else if (u.pathname === '/api/v1/users/me') data = { ...user, name: 'Тест ленты' };
    else if (u.pathname === '/api/v1/external-freight/count') {
      if (options.countFail) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      data = { kind: role === 'driver' ? 'cargo' : 'vehicle', count: options.count ?? 100001 };
    }
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
  if (!options.countFail) await expect(page.getByTestId('external-freight-count')).toHaveText(String(options.count ?? 100001).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
  if (options.entryOnly) return box;
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
  const search = page.getByTestId('external-feed-location-search');
  await expect(search).toBeVisible();
  await expect(search).toBeInViewport();
  await expect(page.getByTestId('loc-geo')).toHaveCount(0);
  await search.fill('Китай');
  await page.getByTestId('external-feed-apply-filters').click();
  await expect(page.getByTestId('external-feed-filter-origin')).toContainText('Китай');
  await expect.poll(() => box.feedQueries.at(-1)?.origin_country).toBe('CN');
  expect(box.feedQueries.at(-1).origin).toBeUndefined();
  await page.getByTestId('external-feed-filter-destination').click();
  await expect(search).toBeInViewport();
  await search.fill('Ташкент');
  await search.press('Enter');
  await expect.poll(() => box.feedQueries.at(-1)?.destination).toBe('Ташкент');
  expect(box.feedQueries.at(-1).destination_country).toBeUndefined();
  const requests = box.feedQueries.length;
  await page.getByTestId('external-feed-filter-origin').click();
  await search.fill('Хоргос');
  expect(box.feedQueries.length).toBe(requests); // Не запрашиваем API на каждый символ.
  await page.getByTestId('external-feed-filter-overlay').getByText('Отмена', { exact: true }).click();
  await expect(page.getByTestId('external-feed-filter-origin')).toContainText('Китай');
  await page.getByTestId('external-feed-filter-origin').click();
  await search.fill('Бахты');
  await page.getByTestId('external-feed-apply-filters').click();
  await expect.poll(() => box.feedQueries.at(-1)?.origin).toBe('Бахты');
  expect(box.feedQueries.at(-1).origin_country).toBeUndefined();
  expect(box.errors).toEqual([]);
});

for (const role of ['driver', 'client']) {
  test(role + ': feed filters do not mutate main filters or write business records; AI stays unused', async ({ page }) => {
    const box = await boot(page, role);
    await page.getByTestId('external-feed-back').click();
    const prefix = role === 'driver' ? 'cargo' : 'trip';
    await page.getByTestId(prefix + '-filter-price').click();
    await page.getByTestId(prefix + '-price-currency-USD').click();
    await page.getByTestId(prefix + '-price-min').fill('2400');
    await page.getByTestId('filter-sheet-apply').click();
    const mainFilter = await page.getByTestId(prefix + '-filter-price').textContent();
    await page.getByTestId('external-freight-entry').click();
    await expect(page.getByTestId('bottom-nav')).not.toBeVisible();
    await page.getByTestId('external-feed-filter-price').click();
    await expect(page.getByTestId('external-feed-price-min')).toBeVisible();
    await page.getByTestId('external-feed-currency-KZT').click();
    await page.getByTestId('external-feed-price-min').fill('1500');
    await expect(page.getByTestId('external-feed-apply-filters')).toBeInViewport();
    await page.getByTestId('external-feed-apply-filters').click();
    await expect.poll(() => box.feedQueries.at(-1)?.min_price).toBe('1500');
    await page.getByTestId('external-feed-expand-external-fixture').click();
    await expect(page.getByTestId('external-feed-translate-external-fixture')).toHaveCount(0);
    await page.getByTestId('external-feed-back').click();
    await expect(page.getByTestId(prefix + '-filter-price')).toHaveText(mainFilter);
    await page.getByTestId(prefix + '-filter-price').click();
    await expect(page.getByTestId(prefix + '-price-min')).toHaveValue('2400');
    expect(box.businessWrites).toEqual([]);
    expect(box.aiRequests).toEqual([]);
    expect(box.errors).toEqual([]);
  });
}

for (const name of ['origin', 'destination', 'body', 'date', 'price']) {
  test('all filters: apply, cancel and reopen ' + name, async ({ page }) => {
    const box = await boot(page, 'client');
    const button = page.getByTestId('external-feed-filter-' + name);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const overlay = page.getByTestId('external-feed-filter-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId('external-feed-apply-filters')).toBeInViewport();
    if (name === 'origin' || name === 'destination') {
      const search = page.getByTestId('external-feed-location-search');
      await expect(search).toBeInViewport();
      await search.fill(name === 'origin' ? 'China' : 'Алматы');
    } else if (name === 'body') await overlay.getByText('Тент', { exact: true }).click();
    else if (name === 'date') await overlay.getByText('Сегодня', { exact: true }).click();
    else {
      await page.getByTestId('external-feed-currency-KZT').click();
      await page.getByTestId('external-feed-price-min').fill('1500,5');
    }
    await page.getByTestId('external-feed-apply-filters').click();
    await expect(overlay).not.toBeVisible();
    if (name === 'origin') await expect.poll(() => box.feedQueries.at(-1)?.origin_country).toBe('CN');
    if (name === 'destination') await expect.poll(() => box.feedQueries.at(-1)?.destination).toBe('Алматы');
    if (name === 'body') await expect.poll(() => box.feedQueries.at(-1)?.body_type).toBe('tent');
    if (name === 'date') {
      await expect.poll(() => box.feedQueries.at(-1)?.published_from).toBeTruthy();
      // Выбранная дата видна на чипе, а не только в отправленном query.
      const month = await page.evaluate(() => new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date()));
      await expect(button).toContainText(month);
    }
    if (name === 'price') await expect.poll(() => box.feedQueries.at(-1)?.min_price).toBe('1500.5');
    const appliedQuery = JSON.stringify(box.feedQueries.at(-1));
    await button.click();
    await expect(overlay).toBeVisible();
    if (name === 'origin' || name === 'destination') await page.getByTestId('external-feed-location-search').fill('Не применять');
    else if (name === 'body') await overlay.getByText('Тент', { exact: true }).click();
    else if (name === 'date') await overlay.getByText('Вчера', { exact: true }).click();
    else await page.getByTestId('external-feed-price-min').fill('9999');
    await overlay.getByText('Отмена', { exact: true }).click();
    await expect(overlay).not.toBeVisible();
    expect(JSON.stringify(box.feedQueries.at(-1))).toBe(appliedQuery);
    await button.click();
    await expect(overlay).toBeVisible();
    if (name === 'origin') await expect(page.getByTestId('external-feed-location-search')).toHaveValue('Китай');
    if (name === 'destination') await expect(page.getByTestId('external-feed-location-search')).toHaveValue('Алматы');
    if (name === 'price') await expect(page.getByTestId('external-feed-price-min')).toHaveValue('1500.5');
    expect(box.errors).toEqual([]);
  });
}


for (const role of ['driver', 'client']) {
  test(role + ': prominent entry fits a six-digit counter on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const box = await boot(page, role, { entryOnly: true });
    const entry = page.getByTestId('external-freight-entry');
    const count = page.getByTestId('external-freight-count');
    await expect(count).toHaveText('100 001');
    const bounds = await entry.boundingBox(), badge = await count.boundingBox();
    expect(badge.x + badge.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(240);
    await expect(entry).toHaveCSS('border-top-width', '1px');
    await page.screenshot({ path: 'test-results/external-entry-' + role + '-320.png' });
    await entry.click();
    await expect(page.getByTestId('external-feed-card-external-fixture')).toBeVisible();
    await expect(page.getByTestId('bottom-nav')).not.toBeVisible();
    expect(box.errors).toEqual([]);
  });
}
test('entry distinguishes a confirmed zero from an unavailable count', async ({ page }) => {
  await boot(page, 'driver', { count: 0, entryOnly: true });
  await expect(page.getByTestId('external-freight-count')).toHaveText('0');
});
test('entry remains usable without a count when API is unavailable', async ({ page }) => {
  const box = await boot(page, 'client', { countFail: true, entryOnly: true });
  await expect(page.getByTestId('external-freight-count')).toHaveCount(0);
  await page.getByTestId('external-freight-entry').click();
  await expect(page.getByTestId('external-feed-card-external-fixture')).toBeVisible();
  expect(box.errors).toEqual([]);
});

// Проверяем наблюдаемое поведение и границы, а не копию реализации стилей.
for (const role of ['driver', 'client']) {
  test(role + ': compact card and full title fit 320px; full description is recoverable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const text = Array.from({ length: 40 }, (_, i) => `Условие ${i + 1}: оригинальные условия перевозки без сокращения.`).join('\n');
    const box = await boot(page, role, { text, item: { weight: 25, volume: 150, vehicle_count: 1, cargo_name: role === 'driver' ? 'Упаковка' : undefined } });
    const card = page.getByTestId('external-feed-card-external-fixture');
    const description = page.getByTestId('external-feed-description-external-fixture');
    const toggle = page.getByTestId('external-feed-expand-external-fixture');
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId('external-feed-title')).toHaveText(role === 'driver' ? 'Лента грузов' : 'Лента машин');
    await expect(page.getByTestId('external-feed-summary-external-fixture')).toContainText('Тент · 25 т · 150 м³ · 1 машина');
    const bounds = await card.boundingBox();
    await expect(description).toHaveCount(0);
    expect(bounds.height).toBeLessThan(370);
    const viewport = page.viewportSize().width;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: `test-results/external-compact-${role}-320.png`, fullPage: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(description).toHaveText(text);
    await page.screenshot({ path: `test-results/external-expanded-${role}-320.png`, fullPage: true });
    expect((await description.boundingBox()).height).toBeGreaterThan(600);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(description).toHaveCount(0);
    expect((await card.boundingBox()).height).toBeLessThan(370);
    expect(box.aiRequests).toEqual([]); expect(box.businessWrites).toEqual([]); expect(box.errors).toEqual([]);
  });

  test(role + ': enlarged text stays inside header, cards and filter actions', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const box = await boot(page, role);
    async function enlarge() {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[data-testid="external-freight-feed-screen"] [dir="auto"], [data-testid="external-feed-filter-overlay"] [dir="auto"]')) {
          if (el.dataset.scaled) continue;
          el.dataset.scaled = '1';
          const s = getComputedStyle(el), size = parseFloat(s.fontSize), height = parseFloat(s.lineHeight);
          el.style.fontSize = `${size * 1.5}px`;
          if (Number.isFinite(height)) el.style.lineHeight = `${height * 1.5}px`;
        }
      });
    }
    await enlarge();
    const title = page.getByTestId('external-feed-title');
    const titleBox = await title.boundingBox(), savedBox = await page.getByTestId('external-feed-saved-only').boundingBox();
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(savedBox.x + 1);
    expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const card = page.getByTestId('external-feed-card-external-fixture');
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/external-compact-${role}-large-text.png`, fullPage: true });
    await page.getByTestId('external-feed-filter-origin').click();
    await enlarge();
    await expect(page.getByTestId('external-feed-location-search')).toBeInViewport();
    const apply = page.getByTestId('external-feed-apply-filters');
    await expect(apply).toBeInViewport();
    expect(await apply.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    for (const label of ['Сброс', 'Отмена', 'Найти']) {
      const action = page.getByTestId('external-feed-filter-overlay').getByRole('button', { name: label, exact: true });
      await expect(action).toBeVisible();
      const textBox = action.getByText(label, { exact: true });
      const singleLine = await textBox.evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).fontSize) * 1.4);
      expect(singleLine, label + ': слово не разрывается внутри кнопки').toBe(true);
    }
    await page.screenshot({ path: `test-results/external-filter-${role}-large-text.png`, fullPage: true });
    await page.getByTestId('external-feed-location-search').fill('Китай');
    await apply.click();
    await expect.poll(() => box.feedQueries.at(-1)?.origin_country).toBe('CN');
    expect(box.errors).toEqual([]);
  });
}

test('even short original text stays hidden until expanded and copying contact does not focus an input', async ({ page, context }) => {
  const box = await boot(page, 'driver', { text: 'Груз готов.' });
  const description = page.getByTestId('external-feed-description-external-fixture');
  await expect(description).toHaveCount(0);
  const toggle = page.getByTestId('external-feed-expand-external-fixture');
  await toggle.click();
  await expect(description).toHaveText('Груз готов.');
  await toggle.click();
  await expect(description).toHaveCount(0);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('external-feed-copy-external-fixture-0').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('+7 700 000 00 01');
  expect(await page.evaluate(() => ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))).toBe(false);
  expect(box.errors).toEqual([]);
});


for (const role of ['driver', 'client']) {
  test(role + ': share uses existing channels, preserves text and supports cancellation at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(() => {
      window.__sharedExternal = [];
      window.__cancelExternalShare = true;
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
        if (window.__cancelExternalShare) throw new DOMException('Cancelled', 'AbortError');
        window.__sharedExternal.push(data);
      }});
    });
    const box = await boot(page, role, { item: { amount: 4500, weight: 25, volume: 150 } });
    const share = page.getByTestId('external-feed-share-external-fixture');
    await expect(share).toBeVisible();
    await share.scrollIntoViewIfNeeded();
    const buttonBox = await share.boundingBox();
    const cardBox = await page.getByTestId('external-feed-card-external-fixture').boundingBox();
    expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    await page.screenshot({ path: `test-results/external-share-${role}-card-320.png`, fullPage: true });
    await share.click();
    await expect(page.getByText('Telegram', { exact: true })).toBeVisible();
    await expect(page.getByText('WhatsApp', { exact: true })).toBeVisible();
    await expect(page.getByText('WeChat', { exact: true })).toBeVisible();
    await expect(page.getByText('WhatsApp', { exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/external-share-${role}-menu-320.png`, fullPage: true });
    await page.getByText('WeChat', { exact: true }).click();
    await expect(page.getByText('Telegram', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__sharedExternal.length)).toBe(0);
    await page.evaluate(() => { window.__cancelExternalShare = false; });
    await page.getByText('WeChat', { exact: true }).click();
    await expect(page.getByText('Telegram', { exact: true })).toHaveCount(0);
    const data = await page.evaluate(() => window.__sharedExternal[0]);
    expect(data.url).toBe('https://qa2.urtruck.kz/');
    expect(data.text).toContain(role === 'driver' ? 'UrTruck · Груз' : 'UrTruck · Машина');
    expect(data.text).toContain('Алматы → Ташкент');
    expect(data.text.replace(/\u00a0|\u202f/g, ' ')).toContain('4 500 USD');
    expect(data.text).toContain('Тент');
    expect(data.text).not.toContain('https://'); // Web Share передаёт единственный URL отдельно.
    expect(data.text).not.toContain('+7 700');
    expect(data.text).not.toContain('Условие 1');
    expect(box.businessWrites).toEqual([]);
    expect(box.aiRequests).toEqual([]);
    expect(box.errors).toEqual([]);
  });
}
