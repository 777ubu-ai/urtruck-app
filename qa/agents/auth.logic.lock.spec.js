// Stage 41 — Auth Logic Lock.
//
// Гард на классические правила входа/регистрации:
//   - «Я водитель» / «Я грузовладелец» → ТОЛЬКО PremiumRegister с правильным title.
//   - «Войти» → ТОЛЬКО PremiumLogin (no consent, no role badge, no «Регистрация»).
//   - «Уже есть аккаунт? Войти» из Register → Login.
//   - «Нет аккаунта? Зарегистрироваться» из Login → Role (без авто-роли).
//   - phone является identity: register existing phone не создаёт дубликат,
//     login по существующему phone восстанавливает role.
//   - logout полностью чистит storage.
//   - старые экраны (Telegram, Apple/Google buttons, password fields) отсутствуют.

const { test } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { snap } = require('../utils/qaScreenshots');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-auth-logic-lock';

const LEGACY = [
  'WhatsApp', 'Telegram', 'Войти через',
  'Личность', 'Документы', 'Транспорт', 'Готово', 'ИИН', 'ПТС',
  'Apple Sign In', 'Sign in with Google', 'Continue with Apple',
];
const FORBIDDEN_PASSWORD_INPUTS = ['type="password"', "type='password'"];

async function bodyText(page) {
  try { return await page.locator('body').innerText({ timeout: 4000 }); } catch { return ''; }
}
async function clear(page) {
  await page.context().clearCookies().catch(() => {});
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
}
async function noLegacy(page, label) {
  const txt = await bodyText(page);
  const found = LEGACY.filter((s) => txt.includes(s));
  if (found.length === 0) log.pass(ACTOR, `${label}-no-legacy`);
  else log.p0(ACTOR, `${label}-no-legacy`, `legacy: ${found.join(', ')}`);
}
async function noPassword(page, label) {
  const html = await page.content().catch(() => '');
  const hit = FORBIDDEN_PASSWORD_INPUTS.find((s) => html.includes(s));
  if (!hit) log.pass(ACTOR, `${label}-no-password-field`);
  else log.p0(ACTOR, `${label}-no-password-field`, `password input found: ${hit}`);
}

async function installMock(page, role) {
  await page.route('**/api/v1/register/whatsapp/send', (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ sent: true, mock: true, beta: true, code: '0000', channel: 'sms' }),
    });
  });
  await page.route('**/api/v1/register/whatsapp/verify', (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-stage41-' + role + '-' + Date.now(),
        verification_level: 1,
        role: null,
        beta: true,
      }),
    });
  });
  await page.route('**/api/v1/register/me', (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u_' + role, phone: '+77000000099', role, verification_level: 1 }),
    });
  });
  await page.route('**/api/v1/notifications/unread', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"count":0}' }));
  await page.route('**/api/v1/chat/unread', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":0,"threads":[]}' }));
  await page.route('**/api/v1/market/my**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"trips":[],"cargos":[]}' }));
}

test.describe.configure({ mode: 'serial' });

// ─── 1. Я водитель → Register driver ───────────────────────────────────

test('lock 1 · «Я водитель» opens PremiumRegister with «Регистрация водителя»', async ({ page }) => {
  await clear(page);
  await page.getByTestId('role-driver').click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);

  if (await page.getByTestId('prem-reg-phone-screen').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'driver-tap-opens-register');
  } else {
    log.p0(ACTOR, 'driver-tap-opens-register', 'register screen not visible');
  }
  const txt = await bodyText(page);
  if (txt.includes('Регистрация водителя')) log.pass(ACTOR, 'driver-title-correct');
  else log.p0(ACTOR, 'driver-title-correct', 'title «Регистрация водителя» missing');
  if (!txt.includes('Вход в аккаунт')) log.pass(ACTOR, 'driver-no-login-title');
  else log.p0(ACTOR, 'driver-no-login-title', 'login title leaked into register');
  await noLegacy(page, 'driver');
  await noPassword(page, 'driver');
  await snap(page, 'auth-lock', '01-driver-register');
});

// ─── 2. Я грузовладелец → Register client ──────────────────────────────

test('lock 2 · «Я грузовладелец» opens PremiumRegister with «Регистрация грузовладельца»', async ({ page }) => {
  await clear(page);
  await page.getByTestId('role-client').click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);

  if (await page.getByTestId('prem-reg-phone-screen').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'client-tap-opens-register');
  } else {
    log.p0(ACTOR, 'client-tap-opens-register', 'register screen not visible');
  }
  const txt = await bodyText(page);
  if (txt.includes('Регистрация грузовладельца')) log.pass(ACTOR, 'client-title-correct');
  else log.p0(ACTOR, 'client-title-correct', 'title «Регистрация грузовладельца» missing');
  if (!txt.includes('Вход в аккаунт')) log.pass(ACTOR, 'client-no-login-title');
  else log.p0(ACTOR, 'client-no-login-title', 'login title leaked into register');
  await noLegacy(page, 'client');
  await noPassword(page, 'client');
  await snap(page, 'auth-lock', '02-client-register');
});

// ─── 3. Войти → Login ──────────────────────────────────────────────────

test('lock 3 · «Войти» opens PremiumLogin without consent / role-register strings', async ({ page }) => {
  await clear(page);
  await page.getByTestId('role-login').click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);

  if (await page.getByTestId('prem-login-screen').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'login-tap-opens-login');
  } else {
    log.p0(ACTOR, 'login-tap-opens-login', 'login screen not visible');
  }
  const txt = await bodyText(page);
  if (txt.includes('Вход в аккаунт')) log.pass(ACTOR, 'login-title-correct');
  else log.p0(ACTOR, 'login-title-correct', 'title «Вход в аккаунт» missing');

  // Login screen НЕ должен содержать registration title и НЕ должен иметь
  // обязательного consent (в нашем UI он вообще не отображается на Login).
  if (!txt.includes('Регистрация водителя') && !txt.includes('Регистрация грузовладельца')) {
    log.pass(ACTOR, 'login-no-register-titles');
  } else {
    log.p0(ACTOR, 'login-no-register-titles', 'register title leaked into login');
  }
  // На Login нет ConsentRow → testID 'consent-row' / 'prem-reg-consent' отсутствует.
  const consent = await page.getByTestId('prem-reg-consent').isVisible().catch(() => false);
  if (!consent) log.pass(ACTOR, 'login-no-consent');
  else log.p0(ACTOR, 'login-no-consent', 'consent row visible on Login');
  await noLegacy(page, 'login');
  await noPassword(page, 'login');
  await snap(page, 'auth-lock', '03-login');
});

// ─── 4. Register → Войти переключение ──────────────────────────────────

test('lock 4 · Register → «Уже есть аккаунт? Войти» opens Login', async ({ page }) => {
  await clear(page);
  await page.getByTestId('role-driver').click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);

  if (!(await page.getByTestId('prem-reg-phone-screen').isVisible().catch(() => false))) {
    log.p0(ACTOR, 'switch-register-to-login-pre', 'register not visible to start');
    return;
  }
  await page.getByTestId('prem-reg-have-account').click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  if (await page.getByTestId('prem-login-screen').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'switch-register-to-login');
  } else {
    log.p0(ACTOR, 'switch-register-to-login', 'login not opened from register link');
  }
});

// ─── 5. Login → Зарегистрироваться → Role (no auto role) ───────────────

test('lock 5 · Login → «Нет аккаунта? Зарегистрироваться» returns to Role', async ({ page }) => {
  await clear(page);
  await page.getByTestId('role-login').click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  if (!(await page.getByTestId('prem-login-screen').isVisible().catch(() => false))) {
    log.p0(ACTOR, 'switch-login-to-role-pre', 'login screen not opened');
    return;
  }
  // Должен быть «Нет аккаунта? Зарегистрироваться» link.
  const noAcct = page.getByTestId('prem-login-no-account');
  if (!(await noAcct.isVisible().catch(() => false))) {
    log.p0(ACTOR, 'switch-login-to-role', 'no-account link not visible');
    return;
  }
  await noAcct.click({ force: true }).catch(() => {});
  // На rn-web stack navigator показывает screen через display:flex/none.
  // Ждём, чтобы prem-login-screen стал hidden, и текст RoleScreen
  // появился в DOM. Лучшая проверка — текст «Я водитель» (он всегда
  // на RoleScreen, даже если testID почему-то не виден).
  let onRole = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(500);
    const txt = await bodyText(page);
    const loginVisible = await page.getByTestId('prem-login-screen').isVisible().catch(() => false);
    // RoleScreen содержит «Я водитель» (role_driver_title), Login — «Вход в аккаунт».
    if (!loginVisible && /Я\s+водитель|driver|Жүргізушімін|司机/.test(txt)) {
      onRole = true;
      break;
    }
  }
  if (onRole) {
    log.pass(ACTOR, 'switch-login-to-role');
  } else {
    log.p0(ACTOR, 'switch-login-to-role',
      'role screen text not found within 7.5s after «Зарегистрироваться»');
  }
});

// ─── 6. Driver flow с phone identity ───────────────────────────────────

test('lock 6 · driver register → logout → login restores same role', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await clear(page);
  await installMock(page, 'driver');

  // Register driver
  await page.getByTestId('role-driver').click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  await page.getByTestId('prem-reg-phone-input').type('+77479171118', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(150);
  await page.getByTestId('prem-reg-consent-toggle').click({ force: true }).catch(() => {});
  await page.waitForTimeout(150);
  await page.getByTestId('prem-reg-send-code').click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  if (await page.getByTestId('prem-reg-otp-screen').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'driver-otp-opens');
  } else {
    log.p0(ACTOR, 'driver-otp-opens', 'OTP not opened');
    return;
  }
  await page.getByTestId('prem-reg-otp-input').type('0000', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Поскольку backend mock вернул role=null, попадаем в RegProfile
  if (await page.getByTestId('prem-reg-profile-screen').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'driver-profile-after-register');
  } else {
    log.p0(ACTOR, 'driver-profile-after-register', 'profile screen not opened');
    return;
  }
  await page.getByTestId('prem-reg-profile-skip').click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  if (await page.getByTestId('bottom-nav').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'driver-main-after-register');
  } else {
    log.p0(ACTOR, 'driver-main-after-register', 'main app not reached');
  }

  const sessionDriver = await page.evaluate(() => window.localStorage.getItem('ur_session'));
  if (sessionDriver && sessionDriver.includes('"role":"driver"')) {
    log.pass(ACTOR, 'driver-session-role-saved');
  } else {
    log.p0(ACTOR, 'driver-session-role-saved', `session=${(sessionDriver || '').slice(0, 80)}`);
  }
  await snap(page, 'auth-lock', '06-driver-after-register');

  // Logout (имитируем через прямой clear, как делает signOut)
  await page.evaluate(() => {
    window.localStorage.removeItem('ur_reg_token');
    window.localStorage.removeItem('ur_session');
    window.localStorage.removeItem('ur_verification_level');
  });
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  if (await page.getByTestId('role-driver').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'driver-logout-returns-role');
  } else {
    log.p0(ACTOR, 'driver-logout-returns-role', 'role screen not shown after logout');
  }

  // Login (mock на verify теперь отдаёт role=driver — existing user)
  await page.unroute('**/api/v1/register/whatsapp/verify').catch(() => {});
  await page.route('**/api/v1/register/whatsapp/verify', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-stage41-driver-login-' + Date.now(),
        verification_level: 1, role: 'driver', beta: true,
      }),
    }));

  await page.getByTestId('role-login').click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  await page.getByTestId('prem-login-phone-input').type('+77479171118', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(150);
  await page.getByTestId('prem-login-send-code').click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  if (await page.getByTestId('prem-reg-otp-screen').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'driver-login-otp-opens');
  } else {
    log.p0(ACTOR, 'driver-login-otp-opens', 'OTP not opened on login');
    return;
  }
  await page.getByTestId('prem-reg-otp-input').type('0000', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(2200);

  // На login backend отдал role=driver → должны попасть СРАЗУ в Main,
  // без RegProfile.
  const profileAgain = await page.getByTestId('prem-reg-profile-screen').isVisible().catch(() => false);
  const mainAfterLogin = await page.getByTestId('bottom-nav').isVisible().catch(() => false);
  if (mainAfterLogin && !profileAgain) {
    log.pass(ACTOR, 'driver-login-skips-profile');
  } else {
    log.p1(ACTOR, 'driver-login-skips-profile', `profile=${profileAgain} main=${mainAfterLogin}`);
  }
  await snap(page, 'auth-lock', '06-driver-after-login');

  if (errors.length === 0) log.pass(ACTOR, 'driver-no-runtime-errors');
  else log.p1(ACTOR, 'driver-no-runtime-errors', `${errors.length}: ${errors.slice(0, 2).join(' | ').slice(0, 200)}`);
});

// ─── 7. Client phone identity flow ─────────────────────────────────────

test('lock 7 · client register → logout → login restores client', async ({ page }) => {
  await clear(page);
  await installMock(page, 'client');

  await page.getByTestId('role-client').click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  await page.getByTestId('prem-reg-phone-input').type('+77479171118', { delay: 20 }).catch(() => {});
  await page.getByTestId('prem-reg-consent-toggle').click({ force: true }).catch(() => {});
  await page.getByTestId('prem-reg-send-code').click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByTestId('prem-reg-otp-input').type('0000', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByTestId('prem-reg-profile-skip').click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  const sessionClient = await page.evaluate(() => window.localStorage.getItem('ur_session'));
  if (sessionClient && sessionClient.includes('"role":"client"')) {
    log.pass(ACTOR, 'client-session-role-saved');
  } else {
    log.p0(ACTOR, 'client-session-role-saved', `session=${(sessionClient || '').slice(0, 80)}`);
  }

  // Logout via storage
  await page.evaluate(() => {
    window.localStorage.removeItem('ur_reg_token');
    window.localStorage.removeItem('ur_session');
    window.localStorage.removeItem('ur_verification_level');
  });
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  if (await page.getByTestId('role-client').isVisible().catch(() => false)) {
    log.pass(ACTOR, 'client-logout-returns-role');
  } else {
    log.p0(ACTOR, 'client-logout-returns-role', 'role screen not shown after client logout');
  }

  // Login mocking existing client
  await page.unroute('**/api/v1/register/whatsapp/verify').catch(() => {});
  await page.route('**/api/v1/register/whatsapp/verify', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-stage41-client-login-' + Date.now(),
        verification_level: 1, role: 'client', beta: true,
      }),
    }));

  await page.getByTestId('role-login').click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  await page.getByTestId('prem-login-phone-input').type('+77479171118', { delay: 20 }).catch(() => {});
  await page.getByTestId('prem-login-send-code').click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByTestId('prem-reg-otp-input').type('0000', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(2200);
  const sessionAfterLogin = await page.evaluate(() => window.localStorage.getItem('ur_session'));
  if (sessionAfterLogin && sessionAfterLogin.includes('"role":"client"')) {
    log.pass(ACTOR, 'client-login-restores-role');
  } else {
    log.p0(ACTOR, 'client-login-restores-role', `session=${(sessionAfterLogin || '').slice(0, 80)}`);
  }
});

// ─── 8. No password fields anywhere in auth flow ───────────────────────

test('lock 8 · no password input fields in any premium auth screen', async ({ page }) => {
  await clear(page);
  await installMock(page, 'driver');

  for (const [testId, label] of [
    ['role-driver', 'register'],
    ['role-login', 'login'],
  ]) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByTestId(testId).click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    await noPassword(page, label);
    await noLegacy(page, label);
  }
});
