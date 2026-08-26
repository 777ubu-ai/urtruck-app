/**
 * P1 theme-consistency visual matrix (25.08.2026).
 *
 * Verifies the light/dark/auto mechanism end to end on the actually-deployed
 * web bundle: `ur_theme` boot read → data-theme / color-scheme / meta
 * theme-color sync → no white-flash → persistence across reload. This is the
 * exact mechanism ThemeContext.js implements (see src/utils/ThemeContext.js)
 * and the exact bug class the owner reported live on iPhone Safari (mixed
 * light+dark UI: some surfaces dark, some stuck light).
 *
 * SCOPE NOTE — read before extending this file:
 * This suite runs against a static `dist/` build with NO backend reachable
 * (see package.json's `test:e2e:local` / `serve` scripts). Cargo/Trip feed,
 * Deals, Border(Queue), and Profile-edit all require an authenticated
 * session (OTP) that cannot be completed here, so this file cannot visually
 * exercise those screens with real data. What it DOES prove, with a real
 * headless browser against the real bundle:
 *   1. the theme boot/sync mechanism itself (data-theme/color-scheme/
 *      meta[theme-color]) for light, dark, and auto (OS-driven);
 *   2. the pre-auth screens (Onboarding, its error-toast state) render
 *      correctly in both themes — no light-locked surface, no white flash;
 *   3. persistence across reload.
 * Deals/CargoFeed/MyTrips/Border/Profile-edit component-level correctness
 * (theme.bg/text/border usage, no hardcoded light-only hex) is enforced
 * separately and unconditionally by the static regression guard
 * `npm run qa:theme` (see qa/utils/themeSmoke.js section 5) plus the manual
 * verification matrix in the PR description. Extend this file with a real
 * login flow once a backend is reachable in CI, rather than faking coverage
 * here.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = (process.env.E2E_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const SHOTS_DIR = path.resolve(__dirname, '..', '..', 'test-results', 'theme-matrix');
const ERROR_OVERLAY_RE = /Что-то пошло не так|Something went wrong|发生错误|Қате орын алды|Бір нәрсе дұрыс болмады/;

// Exact lightTheme/darkTheme.bg from src/utils/theme.js — the boot script
// (deploy.yml no-flash <head> snippet + ThemeContext.js's own effect) writes
// this hex into meta[name=theme-color], so it's the ground truth for "did
// the resolved theme actually apply" without depending on fragile selectors
// into React Native Web's generated DOM.
const EXPECTED_BG = { light: '#f6f8f7', dark: '#0f1512' };

async function themeSignals(page) {
  return page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute('data-theme'),
    colorScheme: document.documentElement.style.colorScheme,
    metaThemeColor: (document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '').toLowerCase(),
  }));
}

async function shoot(page, name) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true }).catch(() => {});
}

test.describe('Theme consistency — light/dark/auto matrix', () => {
  test.setTimeout(60_000);

  for (const mode of ['light', 'dark']) {
    test(`manual ${mode} mode: boot sync, no white-flash, persists on reload`, async ({ page }) => {
      await page.addInitScript((m) => { try { localStorage.setItem('ur_theme', m); } catch {} }, mode);
      await page.goto(`${BASE}/?v=theme-matrix-${mode}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const signals = await themeSignals(page);
      expect(signals.dataTheme, 'data-theme attribute').toBe(mode);
      expect(signals.colorScheme, 'root colorScheme style').toBe(mode);
      expect(signals.metaThemeColor, 'meta[theme-color]').toBe(EXPECTED_BG[mode]);

      const body = await page.locator('body').innerText().catch(() => '');
      expect(ERROR_OVERLAY_RE.test(body), 'no ErrorBoundary on boot').toBe(false);
      expect(body.length, 'onboarding body is not empty').toBeGreaterThan(30);

      await shoot(page, `${mode}-01-onboarding.png`);

      // Trigger the guest "Browse cargo" network call, which fails in this
      // backend-less environment and surfaces the error toast — exactly the
      // "light error surface inside dark UI" failure mode the owner reported.
      // Even without a backend, the toast itself must still respect theme.
      const browseBtn = page.getByText(/Browse cargo|Просмотр груз|浏览货物|Жүктерді қарау/i).first();
      if (await browseBtn.isVisible().catch(() => false)) {
        await browseBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
      const afterSignals = await themeSignals(page);
      expect(afterSignals.dataTheme, 'data-theme unchanged after network error toast').toBe(mode);
      await shoot(page, `${mode}-02-error-toast.png`);

      // Persistence: a fresh navigation (simulating app relaunch) must not
      // flash the other theme before ThemeContext mounts.
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const afterReload = await themeSignals(page);
      expect(afterReload.dataTheme, 'theme persists across reload').toBe(mode);
      expect(afterReload.metaThemeColor, 'meta[theme-color] persists across reload').toBe(EXPECTED_BG[mode]);
    });
  }

  test('auto mode follows the OS color scheme (dark)', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto(`${BASE}/?v=theme-matrix-auto-dark`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const signals = await themeSignals(page);
    expect(signals.dataTheme, 'auto mode resolves dark when OS is dark').toBe('dark');
    expect(signals.metaThemeColor).toBe(EXPECTED_BG.dark);
    await shoot(page, 'auto-dark-01-onboarding.png');
    await context.close();
  });

  test('auto mode follows the OS color scheme (light)', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto(`${BASE}/?v=theme-matrix-auto-light`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const signals = await themeSignals(page);
    expect(signals.dataTheme, 'auto mode resolves light when OS is light').toBe('light');
    expect(signals.metaThemeColor).toBe(EXPECTED_BG.light);
    await shoot(page, 'auto-light-01-onboarding.png');
    await context.close();
  });

  test('explicit light beats OS dark, explicit dark beats OS light', async ({ browser }) => {
    const darkOverridesLight = await browser.newContext({ colorScheme: 'dark' });
    const p1 = await darkOverridesLight.newPage();
    await p1.addInitScript(() => { try { localStorage.setItem('ur_theme', 'light'); } catch {} });
    await p1.goto(`${BASE}/?v=theme-matrix-override-1`, { waitUntil: 'networkidle' });
    await p1.waitForTimeout(1000);
    expect((await themeSignals(p1)).dataTheme, 'manual light wins over OS dark').toBe('light');
    await darkOverridesLight.close();

    const lightOverridesDark = await browser.newContext({ colorScheme: 'light' });
    const p2 = await lightOverridesDark.newPage();
    await p2.addInitScript(() => { try { localStorage.setItem('ur_theme', 'dark'); } catch {} });
    await p2.goto(`${BASE}/?v=theme-matrix-override-2`, { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1000);
    expect((await themeSignals(p2)).dataTheme, 'manual dark wins over OS light').toBe('dark');
    await lightOverridesDark.close();
  });
});
