// Stage 27: visual layout regression guard for RoleScreen across
// viewports. The previous bug ("UrTruck огромный, текст обрезается
// по краям, кнопки уехали вниз") only surfaced on a desktop-narrow
// viewport. uxSmoke can't catch that — it grep'ает исходник, не
// рендерит DOM. This spec runs the welcome screen at three sizes
// and asserts:
//   * page does not show "Что-то пошло не так";
//   * role-driver and role-client are present, visible, ≥40px tall;
//   * role-driver button width fits inside viewport (no horizontal
//     overflow that hints at the gigantic-hero regression);
//   * role-screen-column has maxWidth applied (≤520px on desktop).
//
// Saves screenshots into qa/screenshots/<run-id>/role-layout-<viewport>.png
// for the operator to eyeball after every prod deploy.

const path = require('path');
const fs = require('fs');
const { test, devices } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { BASE_URL, QA_RUN_ID } = require('../utils/qaConfig');

const ACTOR = 'agent-role-layout';

const VIEWPORTS = [
  { name: 'iphone-13',     width: 390, height: 844, mobile: true,  expectMaxWidth: 480 },
  { name: 'pixel-7',       width: 412, height: 915, mobile: true,  expectMaxWidth: 480 },
  { name: 'desktop-narrow', width: 620, height: 920, mobile: false, expectMaxWidth: 520 },
];

const SHOTS_DIR = path.join(__dirname, '..', 'screenshots', QA_RUN_ID);

async function snap(page, label) {
  try { fs.mkdirSync(SHOTS_DIR, { recursive: true }); } catch {}
  const file = path.join(SHOTS_DIR, `role-layout-${label}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

for (const vp of VIEWPORTS) {
  test(`RoleScreen layout · ${vp.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const shot = await snap(page, vp.name);
      log.pass(ACTOR, `screenshot-${vp.name}`, shot);

      // 1. No ErrorBoundary on first paint.
      const body = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
      if (/Что-то пошло не так|Произошла ошибка/i.test(body)) {
        log.p0(ACTOR, `no-error-${vp.name}`, 'ErrorBoundary appeared on first paint');
      } else {
        log.pass(ACTOR, `no-error-${vp.name}`);
      }

      // 2. role-driver / role-client visible & meaningful height.
      for (const id of ['role-driver', 'role-client', 'role-login']) {
        const el = page.getByTestId(id).first();
        const visible = await el.isVisible().catch(() => false);
        if (!visible) {
          log.p0(ACTOR, `${id}-visible-${vp.name}`, 'hotspot not visible');
          continue;
        }
        const box = await el.boundingBox().catch(() => null);
        if (!box || box.height < 40) {
          log.p0(ACTOR, `${id}-bbox-${vp.name}`, `bbox=${JSON.stringify(box)}`);
          continue;
        }
        // Must not bleed past viewport on the right (gigantic-hero regression).
        if (box.x + box.width > vp.width + 4) {
          log.p1(ACTOR, `${id}-overflow-${vp.name}`, `right edge ${Math.round(box.x + box.width)}px > viewport ${vp.width}px`);
          continue;
        }
        log.pass(ACTOR, `${id}-laid-out-${vp.name}`, `bbox=${Math.round(box.width)}×${Math.round(box.height)}`);
      }

      // 3. The max-width column. Desktop sets a 480-520px cap; mobile
      //    fills the whole viewport. We just verify the column exists
      //    and isn't wider than the viewport.
      const col = page.getByTestId('role-screen-column').first();
      if (await col.count()) {
        const cb = await col.boundingBox().catch(() => null);
        if (cb && cb.width > vp.expectMaxWidth + 8) {
          log.p1(ACTOR, `column-width-${vp.name}`, `${Math.round(cb.width)}px exceeds expected cap ${vp.expectMaxWidth}px`);
        } else if (cb) {
          log.pass(ACTOR, `column-width-${vp.name}`, `${Math.round(cb.width)}px (cap ${vp.expectMaxWidth})`);
        }
      } else {
        log.p2(ACTOR, `column-presence-${vp.name}`, 'no role-screen-column testID — likely older bundle still cached');
      }
    } finally {
      await ctx.close();
    }
  });
}
