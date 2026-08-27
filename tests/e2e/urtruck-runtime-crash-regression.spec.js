/**
 * P0-3 runtime crash regression (27.08.2026, owner ТЗ).
 *
 * Real production crashes seen before this test existed:
 *   - "Property 's' doesn't exist" in TabChip (DealsScreen.js) — fixed 22eed75.
 *   - "Can't find variable: colors" in CargoFeedScreen.js — fixed 7e553ec.
 *
 * Both slipped past the existing visual-screen-audit spec because that spec
 * only checks for the ErrorBoundary overlay text ("Что-то пошло не так") in
 * body innerText — a ReferenceError/TypeError that React swallows into a
 * console error (or that fires on a code path the ErrorBoundary doesn't
 * wrap, e.g. inside a StyleSheet factory function evaluated at module load)
 * can pass silently. This spec listens directly to `pageerror` and
 * `console` events and fails loudly on any JS runtime error, not just the
 * ones that happen to trip the ErrorBoundary UI.
 *
 * Flow: cold load → pick role → open Feed (Грузы/Машины) → open Deals
 * (Сделки) → toggle dark → toggle light → assert zero crash-shaped errors
 * across the whole session, in either role.
 *
 * Run:
 *   E2E_BASE_URL=https://urtruck.kz npx playwright test \
 *     tests/e2e/urtruck-runtime-crash-regression.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = (process.env.E2E_BASE_URL || 'https://urtruck.kz').replace(/\/$/, '');

// Crash-shaped errors: uncaught runtime exceptions, not network/asset noise.
// This is intentionally narrow+strict — a false negative here is worse than
// a false positive, since the whole point is to catch exactly this class of
// bug (undefined variable / missing property access) before it ships.
const CRASH_PATTERNS = [
  /ReferenceError/,
  /Can't find variable/i,
  /is not defined/i,
  /Property '.*' doesn't exist/i,
  /undefined is not an object/i,
  /Cannot read propert(?:y|ies) of undefined/i,
  /Cannot read propert(?:y|ies) of null/i,
  /TypeError:.*undefined/i,
];

const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;

function isCrash(text) {
  return CRASH_PATTERNS.some((rx) => rx.test(text));
}

async function runRoleFlow(page, roleLabel, feedTabRe, dealsTabRe) {
  const crashes = [];

  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    if (isCrash(text) || isCrash(err.stack || '')) {
      crashes.push({ where: 'pageerror', text, stack: err.stack });
    }
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (isCrash(text)) crashes.push({ where: 'console', text });
  });

  await page.goto(BASE + '/?v=crash-regression-' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

  const roleRe = roleLabel === 'driver'
    ? /Я водитель|I'm a driver|我是司机|Мен жүргізушімін|Я перевозчик|carrier/i
    : /Я грузовладелец|Я грузоотправитель|shipper|货主|жүк иесі/i;
  const roleBtn = page.getByText(roleRe).first();
  const roleVisible = await roleBtn.isVisible({ timeout: 8000 }).catch(() => false);
  if (roleVisible) {
    await roleBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  const bodyAfterRole = await page.locator('body').innerText().catch(() => '');
  expect(ERROR_OVERLAY_RE.test(bodyAfterRole), `ErrorBoundary right after role selection (${roleLabel})`).toBe(false);

  // Open Feed (Грузы для driver, Машины для client).
  const feedTab = page.getByText(feedTabRe).first();
  if (await feedTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await feedTab.click().catch(() => {});
    await page.waitForTimeout(1800);
  }
  const bodyOnFeed = await page.locator('body').innerText().catch(() => '');
  expect(ERROR_OVERLAY_RE.test(bodyOnFeed), `ErrorBoundary on Feed tab (${roleLabel})`).toBe(false);

  // Open Deals (Сделки).
  const dealsTab = page.getByText(dealsTabRe).first();
  if (await dealsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await dealsTab.click().catch(() => {});
    await page.waitForTimeout(1800);
  }
  const bodyOnDeals = await page.locator('body').innerText().catch(() => '');
  expect(ERROR_OVERLAY_RE.test(bodyOnDeals), `ErrorBoundary on Deals tab (${roleLabel})`).toBe(false);

  // Toggle theme: dark then light, via Profile (☰ → header-menu-btn).
  const menuBtn = page.getByTestId('header-menu-btn').first();
  if (await menuBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await menuBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
    const darkToggle = page.getByTestId('theme-toggle-dark').first();
    if (await darkToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await darkToggle.click().catch(() => {});
      await page.waitForTimeout(1000);
      const bodyDark = await page.locator('body').innerText().catch(() => '');
      expect(ERROR_OVERLAY_RE.test(bodyDark), `ErrorBoundary after switching to dark (${roleLabel})`).toBe(false);
    }
    const lightToggle = page.getByTestId('theme-toggle-light').first();
    if (await lightToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await lightToggle.click().catch(() => {});
      await page.waitForTimeout(1000);
      const bodyLight = await page.locator('body').innerText().catch(() => '');
      expect(ERROR_OVERLAY_RE.test(bodyLight), `ErrorBoundary after switching back to light (${roleLabel})`).toBe(false);
    }
    // Re-visit Feed and Deals once more in dark→light-toggled state — the
    // two real bugs this spec guards against (TabChip 's', CargoFeed
    // 'colors') were both theme-token-related regressions that only
    // surfaced once a theme-dependent style factory actually ran.
    if (await feedTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedTab.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
    if (await dealsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dealsTab.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }

  return crashes;
}

test('driver: onboarding → Грузы → Сделки → dark/light toggle — zero ReferenceError/undefined-property crashes', async ({ page }) => {
  const crashes = await runRoleFlow(page, 'driver', /^Грузы$|^Машины$/, /^Сделки$/);
  if (crashes.length) {
    console.log('CRASHES (driver):', JSON.stringify(crashes, null, 2));
  }
  expect(crashes, `driver flow produced ${crashes.length} crash-shaped runtime error(s)`).toEqual([]);
});

test('client: onboarding → Машины → Сделки → dark/light toggle — zero ReferenceError/undefined-property crashes', async ({ page }) => {
  const crashes = await runRoleFlow(page, 'client', /^Грузы$|^Машины$/, /^Сделки$/);
  if (crashes.length) {
    console.log('CRASHES (client):', JSON.stringify(crashes, null, 2));
  }
  expect(crashes, `client flow produced ${crashes.length} crash-shaped runtime error(s)`).toEqual([]);
});
