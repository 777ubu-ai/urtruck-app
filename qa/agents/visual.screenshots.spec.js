// Stage 42 — Visual screenshots всех ключевых экранов на 3 viewport'ах.
// Не assertion — просто PNG-файлы в qa/screenshots/stage42/<viewport>/.
// Запуск: один раз на каждый Playwright run, не зависит от backend.

const { test } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { BASE_URL } = require('../utils/qaConfig');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-visual';
const OUT_DIR = path.resolve(__dirname, '..', 'screenshots', 'stage42');
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop',     w: 1280, h: 900 },
  { name: 'iphone-13',   w: 390,  h: 844 },
  { name: 'iphone-se',   w: 320,  h: 568 },
];

async function shotAll(page, vpName) {
  const dir = path.join(OUT_DIR, vpName);
  fs.mkdirSync(dir, { recursive: true });

  // Common mock — auth + main + cargos.
  await page.route('**/api/v1/register/me', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u_visual', phone: '+77000000099', role: 'driver', verification_level: 1 }) }));
  await page.route('**/api/v1/notifications/unread', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"count":0}' }));
  await page.route('**/api/v1/chat/unread', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"count":0,"threads":[]}' }));
  await page.route('**/api/v1/market/my**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"trips":[],"cargos":[]}' }));

  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true }).catch(() => {});
  };

  // 1. RoleScreen (guest)
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('01-role');

  // 2. PremiumRegister driver
  await page.getByTestId('role-driver').click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot('02-register-driver');

  // 3. PremiumRegister client
  await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByTestId('role-client').click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot('03-register-client');

  // 4. PremiumLogin
  await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByTestId('role-login').click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot('04-login');

  // 5. PremiumOtp (через login → mock send → переход)
  await page.route('**/api/v1/register/whatsapp/send', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ sent: true, mock: true, beta: true, code: '0000' }) }));
  await page.getByTestId('prem-login-phone-input').type('+77000000099', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(200);
  await page.getByTestId('prem-login-send-code').click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('05-otp');

  // 6/7. PremiumProfile driver/client — инжектим session БЕЗ role,
  //      затем tap role-XXX → premium register → mock send/verify → profile.
  for (const role of ['driver', 'client']) {
    try {
      await page.route('**/api/v1/register/whatsapp/send', (r2) =>
        r2.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ sent: true, mock: true, beta: true, code: '0000' }) }));
      await page.route('**/api/v1/register/whatsapp/verify', (r2) =>
        r2.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ token: 'visual', verification_level: 1, role: null, beta: true }) }));
      await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});
      await page.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1500);
      const btn = page.getByTestId(role === 'driver' ? 'role-driver' : 'role-client');
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click({ force: true });
        await page.waitForTimeout(800);
        const phone = page.getByTestId('prem-reg-phone-input');
        if (await phone.isVisible({ timeout: 5000 }).catch(() => false)) {
          await phone.click({ force: true });
          await phone.fill('+77000000099').catch(() => {});
          await page.waitForTimeout(200);
          await page.getByTestId('prem-reg-consent-toggle').click({ force: true }).catch(() => {});
          await page.getByTestId('prem-reg-send-code').click({ force: true }).catch(() => {});
          await page.waitForTimeout(1000);
          const otp = page.getByTestId('prem-reg-otp-input');
          if (await otp.isVisible({ timeout: 5000 }).catch(() => false)) {
            await otp.click({ force: true });
            await otp.fill('0000').catch(() => {});
            await page.waitForTimeout(2000);
          }
        }
      }
      await shot(`0${6 + (role === 'client' ? 1 : 0)}-profile-${role}`);
    } catch (e) {
      log.p2(ACTOR, `${vpName}-shot-profile-${role}`, (e && e.message || '').slice(0, 100));
    }
  }

  // 8. Main feed (driver)
  try {
    await page.evaluate(() => {
      try {
        window.localStorage.setItem('ur_reg_token', 'visual-feed');
        window.localStorage.setItem('ur_verification_level', '1');
        window.localStorage.setItem('ur_session', JSON.stringify({
          user: { id: 'u_v', phone: '+77000000099', role: 'driver' },
        }));
      } catch {}
    });
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot('08-feed-driver');
  } catch (e) {
    log.p2(ACTOR, `${vpName}-shot-feed-driver`, (e && e.message || '').slice(0, 100));
  }

  // 9. Main feed (client)
  try {
    await page.evaluate(() => {
      try {
        window.localStorage.setItem('ur_session', JSON.stringify({
          user: { id: 'u_v', phone: '+77000000099', role: 'client' },
        }));
      } catch {}
    });
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot('09-feed-client');
  } catch (e) {
    log.p2(ACTOR, `${vpName}-shot-feed-client`, (e && e.message || '').slice(0, 100));
  }

  // 10. CreateCargo (client + tap publish)
  try {
    const pubCargo = page.getByTestId('publish-cargo-button');
    if (await pubCargo.isVisible({ timeout: 4000 }).catch(() => false)) {
      await pubCargo.click({ force: true });
      await page.waitForTimeout(1500);
      await shot('10-create-cargo');
    }
  } catch (e) {
    log.p2(ACTOR, `${vpName}-shot-create-cargo`, (e && e.message || '').slice(0, 100));
  }

  // 11. CreateTrip (driver + tap publish)
  try {
    await page.evaluate(() => {
      try {
        window.localStorage.setItem('ur_session', JSON.stringify({
          user: { id: 'u_v', phone: '+77000000099', role: 'driver' },
        }));
      } catch {}
    });
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    const pubTrip = page.getByTestId('publish-trip-button');
    if (await pubTrip.isVisible({ timeout: 4000 }).catch(() => false)) {
      await pubTrip.click({ force: true });
      await page.waitForTimeout(1500);
      await shot('11-create-trip');
    }
  } catch (e) {
    log.p2(ACTOR, `${vpName}-shot-create-trip`, (e && e.message || '').slice(0, 100));
  }
}

for (const vp of VIEWPORTS) {
  test(`visual · ${vp.name} · all premium screens`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    try {
      await shotAll(page, vp.name);
      log.pass(ACTOR, `${vp.name}-screenshots-captured`);
    } catch (e) {
      log.p1(ACTOR, `${vp.name}-screenshots-captured`, `error: ${(e && e.message || '').slice(0, 200)}`);
    }
  });
}
