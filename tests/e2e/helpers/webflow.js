// Общие helpers для полной e2e-регрессии на СОБРАННОМ веб-UI (dist/ через
// scripts/e2e-static-proxy.js). Backend :8001 в MOCK/BETA (dev) → код 0000.
//
// Живой стек входа: OnboardingV2 → PhoneV2 → OtpV2 → (RoleV2 → ProfileV2) → Main.
const { expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4599';
const API = `${BASE}/api/v1`;
const BETA_CODE = process.env.E2E_BETA_CODE || '0000';
const SHOTS = 'qa/screenshots/e2e-web';

const tid = (id) => `[data-testid="${id}"]`;

async function shot(page, name) {
  try { await page.screenshot({ path: `${SHOTS}/${name}.png` }); } catch {}
}

// Пройти онбординг до экрана PhoneV2.
async function gotoPhoneScreen(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const cta = page.locator(tid('onb-v2-cta-phone'));
  await cta.waitFor({ state: 'visible', timeout: 30000 });
  await cta.click();
  await page.locator(tid('auth-tab-email')).waitFor({ state: 'visible', timeout: 15000 });
}

// Ввести код на OtpV2 и, если новый юзер, выбрать роль + заполнить профиль.
async function passOtpAndOnboard(page, role, { name = 'QA Tester', city = 'Алматы' } = {}) {
  const cells = page.locator(tid('otp-v2-cells'));
  await cells.waitFor({ state: 'visible', timeout: 15000 });
  await cells.click();
  await page.locator(tid('otp-v2-input')).fill(BETA_CODE);

  // Либо RoleV2 (новый юзер), либо сразу Main (returning с ролью).
  const roleScreen = page.locator(tid('role-v2-screen'));
  const nav = page.locator(tid('bottom-nav'));
  await Promise.race([
    roleScreen.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
  ]);

  if (await roleScreen.isVisible().catch(() => false)) {
    // Карточка роли только ВЫБИРАЕТ (setSelected); дальше — CTA «Продолжить».
    await page.locator(tid(role === 'driver' ? 'role-v2-driver' : 'role-v2-client')).click();
    await page.locator(tid('role-v2-cta')).click();
    if (role === 'driver') {
      const driverPhone = page.locator(tid('phone-v2-input'));
      if (await driverPhone.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
        await driverPhone.fill(`777${Date.now().toString().slice(-7)}`);
        await expect(page.locator(tid('phone-v2-cta'))).toBeEnabled();
        await page.locator(tid('phone-v2-cta')).click();
        await page.locator(tid('otp-v2-cells')).waitFor({ state: 'visible', timeout: 15000 });
        await page.locator(tid('otp-v2-cells')).click();
        await page.locator(tid('otp-v2-input')).fill(BETA_CODE);
      }
    }
    // ProfileV2 (имя/город) может быть пропущен: как только выставлена роль,
    // AppNavigator реактивно переключается на Main (ProfileV2 живёт в pre-auth
    // стеке). Поэтому ждём ЛИБО ProfileV2, ЛИБО сразу Main.
    const profile = page.locator(tid('profile-v2-screen'));
    await Promise.race([
      profile.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
      nav.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
    ]);
    if (await profile.isVisible().catch(() => false)) {
      await page.locator(tid('profile-v2-name')).fill(name);
      await page.locator(tid('profile-v2-city')).fill(city);
      await page.locator(tid('profile-v2-cta')).click();
    }
  }
  await nav.waitFor({ state: 'visible', timeout: 20000 });
}

// Полный UI-вход по email. Возвращает признак, дошли ли до Main.
async function emailLogin(page, email, role, opts = {}) {
  await gotoPhoneScreen(page);
  await page.locator(tid('auth-tab-email')).click();
  await page.locator(tid('email-v2-input')).click();
  await page.locator(tid('email-v2-input')).fill(email);
  const cta = page.locator(tid('phone-v2-cta'));
  await expect(cta).toBeEnabled();
  await cta.click();
  await passOtpAndOnboard(page, role, opts);
}

// Полный UI-вход по телефону (channel=phone, дефолтная страна +7).
async function phoneLogin(page, localDigits, role, opts = {}) {
  await gotoPhoneScreen(page);
  await page.locator(tid('auth-tab-phone')).click();
  // режим phone — по умолчанию; вводим локальную часть номера.
  const input = page.locator(tid('phone-v2-input'));
  await input.click();
  await input.fill(localDigits);
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
  if (body.token && role === 'driver') {
    const phone = `+777${Date.now().toString().slice(-8)}`;
    await request.post(`${API}/register/phone/bind/verify`, {
      headers: { Authorization: `Bearer ${body.token}` },
      data: { phone, code: BETA_CODE },
    });
  }
  if (body.token && (role === 'client' || role === 'driver')) {
    await request.post(`${API}/register/role`, {
      headers: { Authorization: `Bearer ${body.token}` },
      data: { role },
    });
  }
  return body.token;
}

async function apiCreateCargo(request, token, overrides = {}) {
  const payload = {
    from_city: 'Алматы', to_city: 'Урумчи', cargo_desc: 'Стройматериалы',
    cargo_type: 'tent', weight_tons: 20, volume_m3: 40,
    price: 420000, currency: 'KZT', pickup_date: '2026-09-20',
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
  gotoPhoneScreen, passOtpAndOnboard, emailLogin, phoneLogin,
  apiEmailToken, apiCreateCargo, apiCreateBid,
};
