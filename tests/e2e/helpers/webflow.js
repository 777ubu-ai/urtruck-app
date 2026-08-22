// Общие helpers для полной e2e-регрессии на СОБРАННОМ веб-UI (dist/ через
// scripts/e2e-static-proxy.js). Backend :8001 в MOCK/BETA (dev) → код 0000.
//
// Живой стек входа: OnboardingV2 → AuthV2(Google/Apple/Email) → OtpV2 →
// (RoleV2 → ProfileV2) → Main. Phone больше не является login-каналом.
const { expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4599';
const API = `${BASE}/api/v1`;
const BETA_CODE = process.env.E2E_BETA_CODE || '0000';
const SHOTS = 'qa/screenshots/e2e-web';

const tid = (id) => `[data-testid="${id}"]`;

async function shot(page, name) {
  try { await page.screenshot({ path: `${SHOTS}/${name}.png` }); } catch {}
}

// Пройти онбординг до canonical Google/Apple/Email auth entry.
// Имя helper оставлено для совместимости старых e2e imports.
async function gotoPhoneScreen(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const cta = page.locator(tid('onb-v2-cta-phone'));
  await cta.waitFor({ state: 'visible', timeout: 30000 });
  await cta.click();
  await page.locator(tid('email-v2-input')).waitFor({ state: 'visible', timeout: 15000 });
  await expect(page.locator(tid('auth-google'))).toBeVisible();
  await expect(page.locator(tid('auth-apple'))).toBeVisible();
}

// Ввести код на OtpV2 и, если новый юзер, выбрать роль + заполнить профиль.
async function passOtpAndOnboard(page, role, { name = 'QA Tester', city = 'Алматы' } = {}) {
  const cells = page.locator(tid('otp-v2-cells'));
  await cells.waitFor({ state: 'visible', timeout: 15000 });
  await cells.click();
  await page.locator(tid('otp-v2-input')).fill(BETA_CODE);

  const roleScreen = page.locator(tid('role-v2-screen'));
  const nav = page.locator(tid('bottom-nav'));
  await Promise.race([
    roleScreen.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
  ]);

  if (await roleScreen.isVisible().catch(() => false)) {
    await page.locator(tid(role === 'driver' ? 'role-v2-driver' : 'role-v2-client')).click();
    await page.locator(tid('role-v2-cta')).click();
    const profile = page.locator(tid('profile-v2-screen'));
    await Promise.race([
      profile.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
      nav.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
    ]);
    if (await profile.isVisible().catch(() => false)) {
      await page.locator(tid('profile-v2-name')).fill(name);
      await page.locator(tid('profile-v2-city')).fill(city);
      // Email/social registration still requires the driver's real contact
      // phone before profile completion. Shipper has the same requirement.
      const phone = page.locator(tid('profile-v2-phone'));
      if (await phone.isVisible().catch(() => false)) {
        await phone.fill('+77011234567');
      }
      const country = page.locator(tid('profile-v2-country'));
      if (await country.isVisible().catch(() => false)) {
        await country.fill('Казахстан');
      }
      await page.locator(tid('profile-v2-cta')).click();
    }
  }
  await nav.waitFor({ state: 'visible', timeout: 20000 });
}

async function emailLogin(page, email, role, opts = {}) {
  await gotoPhoneScreen(page);
  await page.locator(tid('email-v2-input')).click();
  await page.locator(tid('email-v2-input')).fill(email);
  const cta = page.locator(tid('phone-v2-cta'));
  await expect(cta).toBeEnabled();
  await cta.click();
  await passOtpAndOnboard(page, role, opts);
}

// ── API-хелперы (сид данных для C/D, подтверждение статусов) ──
async function apiEmailToken(request, email, role) {
  await request.post(`${API}/register/email/send`, {
    data: { email, consent: true, role },
  });
  const r = await request.post(`${API}/register/email/verify`, {
    data: { email, code: BETA_CODE },
  });
  const body = await r.json();
  return body.token;
}

async function apiCreateCargo(request, token, overrides = {}) {
  const payload = {
    from_city: 'Алматы', to_city: 'Урумчи', cargo_desc: 'Стройматериалы',
    cargo_type: 'tent', weight_tons: 20, volume_m3: 40,
    price: 420000, currency: 'KZT', pickup_date: '2026-07-20',
    ...overrides,
  };
  const r = await request.post(`${API}/market/cargos`, {
    headers: { Authorization: `Bearer ${token}` }, data: payload,
  });
  return { status: r.status(), body: await r.json().catch(() => ({})) };
}

async function apiCreateBid(request, token, cargoId, amount = 400000) {
  const r = await request.post(`${API}/market/bids`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { cargo_id: cargoId, amount, message: 'Готов взять' },
  });
  return { status: r.status(), body: await r.json().catch(() => ({})) };
}

module.exports = {
  BASE, API, BETA_CODE, SHOTS, tid, shot,
  gotoPhoneScreen, passOtpAndOnboard, emailLogin,
  apiEmailToken, apiCreateCargo, apiCreateBid,
};
