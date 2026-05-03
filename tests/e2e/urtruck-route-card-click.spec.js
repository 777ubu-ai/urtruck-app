/**
 * Reproduce ErrorBoundary on routes/drivers feed when clicking visible cards.
 * Targets the live URL — uses real backend data including the suspicious
 * old test cards (Баке, Тестер, Тест Водитель, drivers with empty name).
 *
 *   E2E_BASE_URL=https://urtruck.kz npx playwright test tests/e2e/urtruck-route-card-click.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');
const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;
const CONSOLE_IGNORE = [
  /favicon/i, /webpush|service\s*worker/i, /Manifest:/i, /sw\.js/i,
  /the resource.*was preloaded/i, /Download the React DevTools/i,
  /401 \(Unauthorized\)/i, /403 \(Forbidden\)/i, /429 \(Too Many Requests\)/i,
  /404 \(Not Found\)/i,
];
const NETWORK_IGNORE = [/\/sw\.js$/, /favicon/, /\/manifest\.json$/];

test.describe('Routes-feed card crash reproducer (live)', () => {
  test.use({ locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  test.setTimeout(180_000);

  test('client routes feed: click every visible "Подробнее" card → no crash', async ({ page }) => {
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

    await page.goto(BASE + '/?v=route-card-crash-' + Date.now(), { waitUntil: 'networkidle' });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(/Я грузовладелец|Я грузоотправитель|shipper|货主|жүк иесі/i).first()
      .click({ timeout: 10_000 });
    await page.waitForTimeout(3000);

    // Collect the geometric centers of all visible trip cards in one DOM
    // pass so we can click them by coordinate without re-querying locators
    // (which proved very slow on this list).
    const targets = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('div').forEach(el => {
        if (el.textContent && /^РЕЙС$/.test(el.textContent.trim())) {
          // Walk up to the click target (cursor:pointer ancestor).
          let p = el.parentElement;
          while (p && getComputedStyle(p).cursor !== 'pointer') p = p.parentElement;
          if (!p) return;
          const r = p.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) return;
          out.push({
            cx: r.left + r.width / 2, cy: r.top + r.height / 2,
            text: (p.innerText || '').slice(0, 200),
          });
        }
      });
      return out;
    });
    const cardCount = Math.min(8, targets.length);
    expect(cardCount, 'no trip-card badges (РЕЙС) visible on routes feed').toBeGreaterThan(0);

    const crashed = [];
    for (let i = 0; i < cardCount; i++) {
      const t = targets[i];
      // Each iteration may invalidate previous bounding boxes after navigate.
      // Re-fetch the i-th coordinate before each click in case scroll moved.
      const fresh = await page.evaluate((idx) => {
        const cards = [];
        document.querySelectorAll('div').forEach(el => {
          if (el.textContent && /^РЕЙС$/.test(el.textContent.trim())) {
            let p = el.parentElement;
            while (p && getComputedStyle(p).cursor !== 'pointer') p = p.parentElement;
            if (p) cards.push(p);
          }
        });
        const c = cards[idx];
        if (!c) return null;
        c.scrollIntoView({ block: 'center' });
        const r = c.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, text: (c.innerText || '').slice(0, 200) };
      }, i);
      if (!fresh) continue;
      await page.mouse.click(fresh.cx, fresh.cy).catch(() => {});
      await page.waitForTimeout(1500);

      const body = await page.locator('body').innerText().catch(() => '');
      if (ERROR_OVERLAY_RE.test(body)) {
        crashed.push({ index: i, cardText: fresh.text, stack: stacks.slice(-1)[0] || '(no stack)' });
        const dir = path.resolve(__dirname, '..', '..', 'test-results', 'route-crash');
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `crash-card-${i}.png`), fullPage: true });
      }

      const back = page.getByText(/^‹$/).first();
      if (await back.isVisible().catch(() => false)) {
        await back.click({ timeout: 2_000 }).catch(() => {});
      } else {
        await page.goBack().catch(() => {});
      }
      await page.waitForTimeout(700);
    }

    console.log('CARDS CLICKED:', cardCount);
    console.log('CRASHED:', JSON.stringify(crashed, null, 2));
    console.log('PAGE STACKS:', stacks.length, stacks.join('\n---\n'));
    console.log('CONSOLE ERRORS:', consoleErrors.length, consoleErrors.join(' | '));
    console.log('HTTP 5xx:', networkErrors.length, networkErrors.join(' | '));

    expect(crashed, `ErrorBoundary on cards: ${JSON.stringify(crashed, null, 2)}`).toEqual([]);
    expect(stacks, stacks.join('\n')).toEqual([]);
    expect(consoleErrors, JSON.stringify(consoleErrors)).toEqual([]);
    expect(networkErrors, JSON.stringify(networkErrors)).toEqual([]);
  });
});
