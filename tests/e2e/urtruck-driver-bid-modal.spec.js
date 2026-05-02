/**
 * P0 reproducer: driver feed → click first cargo card → BidModal must open
 * without ErrorBoundary crash. We do NOT submit the bid — only open and
 * close the modal so no production data is created.
 *
 * Run:
 *   E2E_BASE_URL=https://urtruck.kz npx playwright test \
 *     tests/e2e/urtruck-driver-bid-modal.spec.js --headed
 */
const { test, expect } = require('@playwright/test');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');
const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;

const CONSOLE_IGNORE = [
  /favicon/i, /webpush|service\s*worker/i, /Manifest:/i, /sw\.js.*404/i,
  /the resource.*was preloaded/i, /Download the React DevTools/i,
  /Failed to load resource.*404 \(File not found\)/i,
  /Failed to load resource.*501 \(Unsupported method/i,
  // Guest accounts hit auth-required endpoints (e.g. /market/my, /chat/rooms)
  // and the bundle logs 401 to console. These are normal for unverified
  // guests and not a UI crash.
  /401 \(Unauthorized\)/i,
  /403 \(Forbidden\)/i,
];
const NETWORK_IGNORE = [/\/sw\.js$/, /favicon/, /\/manifest\.json$/];

test.describe('Driver Bid Modal — open without crash', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  test.setTimeout(120_000);

  test('driver opens first cargo → BidModal opens, no ErrorBoundary, no submit', async ({ page }) => {
    test.skip(/127\.0\.0\.1|localhost/.test(BASE),
      'no-mock test: requires nginx-proxied backend (live URL only)');
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

    // ── 1. enter as driver ──────────────────────────────────────────
    await page.goto(BASE + '/?v=bid-modal-repro', { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle' });
    const roleBtn = page.getByText(
      /Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i,
    ).first();
    await roleBtn.waitFor({ timeout: 10_000 });
    await roleBtn.click();
    await page.waitForTimeout(2500);

    // ── 2. wait for feed to render at least one cargo card ──────────
    // Cargo card always shows price like $XXXX or "Договорная" + city → city.
    const arrow = page.getByText(/→/).first();
    await arrow.waitFor({ timeout: 15_000 });

    const feedBody = await page.locator('body').innerText();
    expect(feedBody, 'feed: error overlay').not.toMatch(ERROR_OVERLAY_RE);

    // ── 3. iterate over up to 5 cargo cards looking for any that crashes
    //       CargoDetail or BidModal. We click each "Откликнуться" link and
    //       walk back. The bug is positional in some payloads, not in all.
    const respondTexts = page.getByText(/Откликнуться|Respond|出价|Жауап беру/);
    const cardCount = Math.min(5, await respondTexts.count());
    expect(cardCount, 'no cargo cards visible on feed').toBeGreaterThan(0);

    let crashedAt = null;
    let modalOpenedAt = null;
    for (let i = 0; i < cardCount; i++) {
      const link = respondTexts.nth(i);
      if (!(await link.isVisible().catch(() => false))) continue;
      await link.click({ timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const detailBody = await page.locator('body').innerText();

      if (ERROR_OVERLAY_RE.test(detailBody)) {
        crashedAt = `card #${i}`;
        console.log(`[bid-modal-repro] ErrorBoundary on card #${i}`);
        break;
      }

      // Try to open BidModal on this card.
      const bidBtn = page.getByText(/Предложить цену|Suggest price|提议价格|Баға ұсыну/i).first();
      if (await bidBtn.isVisible().catch(() => false)) {
        await bidBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
        const modalBody = await page.locator('body').innerText();
        if (ERROR_OVERLAY_RE.test(modalBody)) {
          crashedAt = `card #${i} after opening BidModal`;
          console.log(`[bid-modal-repro] ErrorBoundary after BidModal open on card #${i}`);
          break;
        }
        if (/\$[0-9]/.test(modalBody) || /Средняя цена|Send bid|Отправить ставку|发送|Жіберу/i.test(modalBody)) {
          modalOpenedAt = `card #${i}`;
        }
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
      // Walk back to feed for next card.
      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) {
        await back.click().catch(() => {});
        await page.waitForTimeout(1200);
      }
    }

    expect(crashedAt, `ErrorBoundary appeared at ${crashedAt}`).toBeNull();
    expect(modalOpenedAt, 'BidModal must open on at least one card').not.toBeNull();

    // ── 7. final diagnostics ────────────────────────────────────────
    if (stacks.length) console.log('PAGE ERRORS:\n' + stacks.join('\n---\n'));
    expect(stacks.length, 'page-level JS errors:\n' + stacks.join('\n---\n')).toBe(0);
    expect(consoleErrors, JSON.stringify(consoleErrors, null, 2)).toEqual([]);
    expect(networkErrors, JSON.stringify(networkErrors, null, 2)).toEqual([]);
  });

  test('client opens trip/driver card → DriverDetail/TripDetail, no ErrorBoundary', async ({ page }) => {
    test.skip(/127\.0\.0\.1|localhost/.test(BASE),
      'no-mock test: requires nginx-proxied backend (live URL only)');
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

    await page.goto(BASE + '/?v=client-bid-modal-repro', { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle' });
    const clientBtn = page.getByText(
      /Я грузовладелец|Я грузоотправитель|shipper|货主|жүк иесі/i,
    ).first();
    await clientBtn.waitFor({ timeout: 10_000 });
    await clientBtn.click();
    await page.waitForTimeout(2500);

    // For client, feed shows trips/drivers. The detail-link text is "Подробнее"
    // (details). Click each up to 5 cards.
    const detailsTexts = page.getByText(/Подробнее|Details|详情|Толығырақ/);
    const count = Math.min(5, await detailsTexts.count());

    let crashedAt = null;
    for (let i = 0; i < count; i++) {
      const link = detailsTexts.nth(i);
      if (!(await link.isVisible().catch(() => false))) continue;
      await link.click({ timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const body = await page.locator('body').innerText();
      if (ERROR_OVERLAY_RE.test(body)) {
        crashedAt = `client card #${i}`;
        break;
      }
      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) {
        await back.click().catch(() => {});
        await page.waitForTimeout(1200);
      }
    }

    if (stacks.length) console.log('PAGE ERRORS (client):\n' + stacks.join('\n---\n'));
    expect(crashedAt, `ErrorBoundary at ${crashedAt}`).toBeNull();
    expect(stacks.length, 'page-level JS errors').toBe(0);
    expect(consoleErrors, JSON.stringify(consoleErrors, null, 2)).toEqual([]);
    expect(networkErrors, JSON.stringify(networkErrors, null, 2)).toEqual([]);
  });
});
