/**
 * Reproduce Android/mobile feed crash. The user reports ErrorBoundary
 * "Что-то пошло не так" appearing in the routes/drivers feed on Android,
 * while desktop/iOS does not consistently crash.
 *
 * Strategy: emulate Pixel-like Android viewport (360x740) + Android Chrome
 * UA + hasTouch + isMobile. Hit feed in BOTH driver mode (cargo list) and
 * client mode (drivers/trips list). Scroll, then click up to 15 cards. Any
 * ErrorBoundary / pageerror / 5xx surfaces a clear failure with the card
 * text + JS stack.
 *
 * Run:
 *   E2E_BASE_URL=https://urtruck.kz npx playwright test \
 *     tests/e2e/urtruck-android-feed-crash.spec.js
 */
const { test, expect, devices } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');
const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;

const CONSOLE_IGNORE = [
  /favicon/i, /webpush|service\s*worker/i, /Manifest:/i, /sw\.js.*404/i,
  /the resource.*was preloaded/i, /Download the React DevTools/i,
  /401 \(Unauthorized\)/i, /403 \(Forbidden\)/i, /429 \(Too Many Requests\)/i,
  // Page assets that 404 on prod (cache-busted bundle, optional images,
  // missing translation files) are noise vs the ErrorBoundary check. Only
  // 5xx and uncaught JS errors matter for crash reproduction.
  /404 \(Not Found\)/i,
];
const NETWORK_IGNORE = [/\/sw\.js$/, /favicon/, /\/manifest\.json$/];

const ANDROID = {
  viewport: { width: 360, height: 740 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 ' +
             '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  hasTouch: true, isMobile: true, deviceScaleFactor: 2.625,
};

async function runMode(page, role, mode) {
  const consoleErrors = [];
  const networkErrors = [];
  const stacks = [];
  page.on('pageerror', err => stacks.push(`${err.name}: ${err.message}\n${err.stack || ''}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (CONSOLE_IGNORE.some(rx => rx.test(t))) return;
    consoleErrors.push(t);
  });
  page.on('response', r => {
    if (r.status() < 500) return;
    if (NETWORK_IGNORE.some(rx => rx.test(r.url()))) return;
    if (r.status() === 501) return;
    networkErrors.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(BASE + '/?v=android-crash-' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'networkidle' });

  const re = role === 'driver'
    ? /Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i
    : /Я грузовладелец|Я грузоотправитель|shipper|货主|жүк иесі/i;
  const roleBtn = page.getByText(re).first();
  await roleBtn.waitFor({ timeout: 10_000 });
  await roleBtn.click();
  await page.waitForTimeout(2500);

  const initialBody = await page.locator('body').innerText();
  if (ERROR_OVERLAY_RE.test(initialBody)) {
    return { mode, status: 'crashed-on-feed', cardText: '(initial feed)', stacks, consoleErrors, networkErrors };
  }

  // Scroll the feed deeply (mobile WebView often only renders crashing items
  // when they enter the viewport).
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 600).catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.mouse.wheel(0, -10000).catch(() => {}); // back to top

  // Click up to 15 cards. For driver feed the "Откликнуться" row is unique
  // per cargo card; for client feed "Подробнее" is unique per driver/trip card.
  const linkRe = role === 'driver'
    ? /Откликнуться|Respond|出价|Жауап беру/i
    : /Подробнее|Details|详情|Толығырақ|Откликнуться|Respond|出价|Жауап беру/i;
  const links = page.getByText(linkRe);
  const cardCount = Math.min(15, await links.count());

  for (let i = 0; i < cardCount; i++) {
    const link = links.nth(i);
    if (!(await link.isVisible().catch(() => false))) continue;
    let cardText = '';
    try {
      const card = link.locator('xpath=ancestor::*[self::div][1]').first();
      cardText = (await card.innerText().catch(() => '')).slice(0, 120);
    } catch {}
    await link.scrollIntoViewIfNeeded({ timeout: 4_000 }).catch(() => {});
    await link.click({ timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(1800);

    const body = await page.locator('body').innerText().catch(() => '');
    if (ERROR_OVERLAY_RE.test(body)) {
      return { mode, status: 'crashed-on-card', cardIndex: i, cardText, stacks, consoleErrors, networkErrors };
    }

    // Walk back to feed.
    const back = page.getByText(/^‹$/).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click().catch(() => {});
    } else {
      await page.goBack().catch(() => {});
    }
    await page.waitForTimeout(900);
  }

  return { mode, status: 'ok', cardsClicked: cardCount, stacks, consoleErrors, networkErrors };
}

test.describe('Android feed crash reproducer', () => {
  test.use({ ...ANDROID, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  test.setTimeout(240_000);

  test('Android UA — driver feed cargo cards × 15 → no crash', async ({ page }) => {
    test.skip(/127\.0\.0\.1|localhost/.test(BASE),
      'no-mock test: requires nginx-proxied backend (live URL only)');
    const r = await runMode(page, 'driver', 'driver-feed');
    console.log('[android-driver]', JSON.stringify(r, null, 2));
    if (r.status === 'crashed-on-card' || r.status === 'crashed-on-feed') {
      const dir = path.resolve(__dirname, '..', '..', 'test-results', 'android-crash');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, 'driver-crash.png'), fullPage: true });
    }
    expect(r.stacks.length, 'page-level JS errors:\n' + r.stacks.join('\n---\n')).toBe(0);
    expect(r.status, 'crash status: ' + r.status + ' card="' + (r.cardText || '') + '"').toBe('ok');
    expect(r.consoleErrors, JSON.stringify(r.consoleErrors)).toEqual([]);
    expect(r.networkErrors, JSON.stringify(r.networkErrors)).toEqual([]);
  });

  test('Android UA — client routes feed driver/trip cards × 15 → no crash', async ({ page }) => {
    test.skip(/127\.0\.0\.1|localhost/.test(BASE),
      'no-mock test: requires nginx-proxied backend (live URL only)');
    const r = await runMode(page, 'client', 'client-routes');
    console.log('[android-client]', JSON.stringify(r, null, 2));
    if (r.status === 'crashed-on-card' || r.status === 'crashed-on-feed') {
      const dir = path.resolve(__dirname, '..', '..', 'test-results', 'android-crash');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, 'client-crash.png'), fullPage: true });
    }
    expect(r.stacks.length, 'page-level JS errors:\n' + r.stacks.join('\n---\n')).toBe(0);
    expect(r.status, 'crash status: ' + r.status + ' card="' + (r.cardText || '') + '"').toBe('ok');
    expect(r.consoleErrors, JSON.stringify(r.consoleErrors)).toEqual([]);
    expect(r.networkErrors, JSON.stringify(r.networkErrors)).toEqual([]);
  });
});
