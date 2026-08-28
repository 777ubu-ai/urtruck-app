/**
 * P0-3 runtime crash regression (27.08.2026, owner ТЗ; fail-closed 28.08.2026).
 *
 * Real production crashes seen before this test existed:
 *   - "Property 's' doesn't exist" in TabChip (DealsScreen.js) — fixed 22eed75.
 *   - "Can't find variable: colors" in CargoFeedScreen.js — fixed 7e553ec.
 *
 * Both slipped past the visual-screen-audit spec because that spec only checks
 * for the ErrorBoundary overlay text — a ReferenceError/TypeError that React
 * swallows into a console error (or fires inside a StyleSheet factory at module
 * load, which the ErrorBoundary doesn't wrap) passes silently. This spec listens
 * directly to `pageerror`/`console` and fails loudly on any JS runtime error.
 *
 * FAIL-CLOSED (independent re-review 28.08.2026): the previous version made every
 * navigation step conditional on `isVisible()` and swallowed click failures, so a
 * run that never reached role/Feed/Deals/theme still returned crashes=[] and went
 * green. It also targeted the retired legacy "Я водитель" role screen, which no
 * longer exists (current entry is OnboardingV2), so the traversal was effectively
 * a no-op. This version:
 *   - runs deterministically against the served build with a mocked backend +
 *     an injected verified session (role driver/client) → the app boots straight
 *     into Main, exactly the state where the two guarded bugs render;
 *   - makes EVERY traversal step a hard assertion (expect(...).toBeVisible then
 *     click) — Feed → Deals → ☰ → dark → light → back → Feed → Deals — so a
 *     skipped/unreachable state FAILS the test instead of silently passing;
 *   - still asserts zero crash-shaped runtime errors across the whole session.
 *
 * Wired into mandatory CI as its own project in qa/playwright.config.js, so the
 * Full QA desktop job runs it on every PR (it did not run anywhere before).
 */
const { test, expect } = require('@playwright/test');

let BASE_URL;
try {
  ({ BASE_URL } = require('../../qa/utils/qaConfig'));
} catch {
  BASE_URL = (process.env.QA_BASE_URL || process.env.E2E_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
}

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
const isCrash = (t) => CRASH_PATTERNS.some((rx) => rx.test(t));

async function mockBackend(page) {
  const json = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/v1/register/me', json({ id: 'crash-user', role: 'guest', verification_level: 1, phone: null }));
  await page.route('**/api/v1/users/me', json({ name: 'QA Crash User', city: 'Алматы' }));
  await page.route('**/api/v1/push/**', json({}));
  await page.route('**/api/v1/notifications/**', json({ items: [], count: 0 }));
  await page.route('**/api/v1/chat/**', json({ count: 0, threads: [], items: [] }));
  await page.route('**/api/v1/market/**', json({ items: [], trips: [], cargos: [], bids: [] }));
  await page.route('**/api/v1/deals/**', json({ items: [], deals: [] }));
}

async function assertNoOverlay(page, where) {
  const body = await page.locator('body').innerText().catch(() => '');
  expect(ERROR_OVERLAY_RE.test(body), `ErrorBoundary overlay at: ${where}`).toBe(false);
}

async function runRoleFlow(page, role) {
  const crashes = [];
  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    if (isCrash(text) || isCrash(err.stack || '')) crashes.push({ where: 'pageerror', text });
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && isCrash(m.text())) crashes.push({ where: 'console', text: m.text() });
  });

  await mockBackend(page);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });

  // Инъекция верифицированной сессии с ролью — приложение грузится сразу в Main
  // (то самое состояние, где рендерятся Feed/Deals — оба ранее падавших экрана).
  // Инъекция только для детерминированного входа; см. onboarding.v2 спек.
  await page.evaluate((r) => {
    localStorage.setItem('ur_reg_token', 'crash-regression-token');
    localStorage.setItem('ur_session', JSON.stringify({ user: { phone: null, role: r, id: 'crash-' + r } }));
    localStorage.setItem('ur_verification_level', '1');
  }, role);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });

  // ── ОБЯЗАТЕЛЬНО: вход в приложение (role → Main). Не достигли — тест падает. ──
  await expect(page.getByTestId('bottom-nav'), `bottom-nav must render for ${role}`).toBeVisible({ timeout: 20000 });
  await assertNoOverlay(page, `Main just after ${role} login`);

  // ── ОБЯЗАТЕЛЬНО: вкладка Feed (Грузы/Машины) ──
  const feedTab = page.getByTestId('bottom-nav-feed');
  await expect(feedTab, `Feed tab must be present (${role})`).toBeVisible({ timeout: 10000 });
  await feedTab.click();
  await page.waitForTimeout(1200);
  await assertNoOverlay(page, `Feed tab (${role})`);

  // ── ОБЯЗАТЕЛЬНО: вкладка Deals (Сделки) — здесь падал TabChip 's' ──
  const dealsTab = page.getByTestId('bottom-nav-deals');
  await expect(dealsTab, `Deals tab must be present (${role})`).toBeVisible({ timeout: 10000 });
  await dealsTab.click();
  await page.waitForTimeout(1200);
  await assertNoOverlay(page, `Deals tab (${role})`);

  // ── ОБЯЗАТЕЛЬНО: ☰ → Profile → тема dark, затем light ──
  // ☰ на вкладке Feed = feed-menu-btn (ведёт в Profile). Возвращаемся на Feed,
  // чтобы шаг был детерминированным независимо от текущей вкладки.
  await feedTab.click();
  await page.waitForTimeout(600);
  const menuBtn = page.getByTestId('feed-menu-btn').first();
  await expect(menuBtn, `header ☰ (feed-menu-btn) must be present (${role})`).toBeVisible({ timeout: 10000 });
  await menuBtn.click();
  await page.waitForTimeout(1000);
  await assertNoOverlay(page, `Profile via ☰ (${role})`);

  const darkToggle = page.getByTestId('theme-toggle-dark').first();
  await expect(darkToggle, `dark theme toggle must be present (${role})`).toBeVisible({ timeout: 10000 });
  await darkToggle.click();
  await page.waitForTimeout(900);
  await assertNoOverlay(page, `after switch to DARK (${role})`);

  const lightToggle = page.getByTestId('theme-toggle-light').first();
  await expect(lightToggle, `light theme toggle must be present (${role})`).toBeVisible({ timeout: 10000 });
  await lightToggle.click();
  await page.waitForTimeout(900);
  await assertNoOverlay(page, `after switch back to LIGHT (${role})`);

  // ── ОБЯЗАТЕЛЬНО: вернуться в Main и перерисовать Feed+Deals в переключённой
  // теме — обе реальные регрессии (TabChip 's', CargoFeed 'colors') всплывали
  // только когда theme-зависимая style-фабрика реально исполнялась. ──
  const profileBack = page.getByTestId('profile-back').first();
  await expect(profileBack, `profile back button must be present (${role})`).toBeVisible({ timeout: 10000 });
  await profileBack.click();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('bottom-nav'), `back to Main after theme (${role})`).toBeVisible({ timeout: 15000 });
  const feedTab2 = page.getByTestId('bottom-nav-feed');
  await expect(feedTab2, `Feed tab after theme toggle (${role})`).toBeVisible({ timeout: 10000 });
  await feedTab2.click();
  await page.waitForTimeout(1000);
  await assertNoOverlay(page, `Feed after theme toggle (${role})`);
  const dealsTab2 = page.getByTestId('bottom-nav-deals');
  await expect(dealsTab2, `Deals tab after theme toggle (${role})`).toBeVisible({ timeout: 10000 });
  await dealsTab2.click();
  await page.waitForTimeout(1000);
  await assertNoOverlay(page, `Deals after theme toggle (${role})`);

  return crashes;
}

test('driver: role → Грузы → Сделки → dark → light — zero runtime crashes', async ({ page }) => {
  const crashes = await runRoleFlow(page, 'driver');
  if (crashes.length) console.log('CRASHES (driver):', JSON.stringify(crashes, null, 2));
  expect(crashes, `driver flow produced ${crashes.length} crash-shaped runtime error(s)`).toEqual([]);
});

test('client: role → Машины → Сделки → dark → light — zero runtime crashes', async ({ page }) => {
  const crashes = await runRoleFlow(page, 'client');
  if (crashes.length) console.log('CRASHES (client):', JSON.stringify(crashes, null, 2));
  expect(crashes, `client flow produced ${crashes.length} crash-shaped runtime error(s)`).toEqual([]);
});
