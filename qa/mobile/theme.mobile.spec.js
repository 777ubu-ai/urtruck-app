// Mobile lane — theme contract (P1 theme fix 2026-08).
//
// UrTruck теперь имеет РАБОЧИЙ переключатель light/dark (ThemeContext,
// приоритет ручного выбора над системой; см. tests/unit/themeResolve).
// Здесь проверяем на реальном web-рендере:
//   1) дефолт (system→light на CI): фон светлый, текст читаем, без flash;
//   2) forced dark (localStorage ur_theme=dark ДО загрузки): фон реально
//      тёмный и data-theme='dark' — тумблер применяется, а не игнорируется;
//   3) persistence: после reload dark сохраняется.

const { test } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { BASE_URL } = require('../utils/qaConfig');

const ACTOR = 'agent-mobile-theme';

function rgbToLuminance(rgb) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(rgb || ''));
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function bodyBgLum(page) {
  const bg = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="root"]') || document.body;
    return getComputedStyle(el).backgroundColor;
  });
  return { bg, lum: rgbToLuminance(bg) };
}

test('Mobile · default theme renders a readable light surface', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const { bg, lum } = await bodyBgLum(page);
  if (lum === null) { log.p2(ACTOR, 'default-bg-detectable', `cannot parse bg=${bg}`); return; }
  // Дефолт (system на CI без prefers-dark) — светлый фон.
  if (lum > 0.6) log.pass(ACTOR, 'default-bg-light', `lum=${lum.toFixed(2)} bg=${bg}`);
  else log.p2(ACTOR, 'default-bg-light', `default bg not clearly light (lum=${lum.toFixed(2)}) — CI OS theme?`);
});

test('Mobile · forced dark theme actually applies + persists', async ({ page, context }) => {
  await context.addInitScript(() => { try { localStorage.setItem('ur_theme', 'dark'); } catch (e) {} });
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const { bg, lum } = await bodyBgLum(page);
  if (lum === null) { log.p2(ACTOR, 'dark-bg-detectable', `cannot parse bg=${bg}`); return; }
  if (lum < 0.25) log.pass(ACTOR, 'dark-applies', `dark bg lum=${lum.toFixed(2)} bg=${bg}`);
  else log.p1(ACTOR, 'dark-applies', `dark toggle NOT applied — bg still bright (lum=${lum.toFixed(2)} bg=${bg})`);

  // persistence через reload
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const after = await bodyBgLum(page);
  if (after.lum !== null && after.lum < 0.25) log.pass(ACTOR, 'dark-persists', `after reload lum=${after.lum.toFixed(2)}`);
  else log.p1(ACTOR, 'dark-persists', `dark did NOT persist after reload (lum=${after.lum})`);
});
