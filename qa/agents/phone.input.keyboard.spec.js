// Stage 46 — phone input должен работать на любой клавиатуре
// (русская / английская / казахская / китайская).
//
// Реальный bug владельца: на iPhone с активной Қазақша клавиатурой
// верхний ряд цифр заменён казахскими буквами (ӘІҢҒҮҰҚӨҺ), и без
// `inputMode="tel"` мобильный браузер показывал именно эту
// клавиатуру — пользователь физически не мог ввести цифру.
//
// Что мы можем проверить в headless-Chromium:
//   1. inputMode="tel" / autoComplete="tel" реально присутствуют
//      в DOM — это и есть фикс, который заставляет мобильный
//      браузер открывать numeric keypad независимо от системной
//      раскладки.
//   2. Phone input принимает любые форматы paste:
//      "+7 747 917 11 18" / "8 747 917 11 18" / "7479171118" /
//      "+7-747-917-11-18" — все нормализуются в одно и то же.
//   3. Кнопка «Получить код» становится active после полного
//      ввода (helper-проверка disabled-state).
//   4. Unicode digits (арабские ٠١٢٣ / fullwidth ０１２３) тоже
//      нормализуются — это safety net на случай неожиданных IME.

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-phone-keyboard';
const TEST_PHONE_DIGITS = '+77479171118';

async function mockCommon(page) {
  await page.route('**/api/v1/register/me', (r) =>
    r.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ detail: 'Токен не предоставлен' }) }));
  await page.route('**/api/v1/register/whatsapp/send', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ sent: true, mock: true, beta: true, code: '0000' }) }));
  await page.route('**/api/v1/notifications/unread', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"count":0}' }));
}

async function gotoFresh(page) {
  await mockCommon(page);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function openRegister(page, role) {
  await page.getByTestId(role === 'driver' ? 'role-driver' : 'role-client').click({ force: true });
  await page.waitForTimeout(1200);
}

async function openLogin(page) {
  await page.getByTestId('role-login').click({ force: true });
  await page.waitForTimeout(1200);
}

test.describe.configure({ mode: 'serial' });

// ─────────────── inputMode / autoComplete sanity ──────────────

test('register driver · phone input имеет inputMode="tel" + autoComplete', async ({ page }) => {
  await gotoFresh(page);
  await openRegister(page, 'driver');
  const input = page.getByTestId('prem-reg-phone-input');
  await expect(input).toBeVisible({ timeout: 10000 });

  const im = await input.getAttribute('inputmode');
  const ac = await input.getAttribute('autocomplete');
  const type = await input.getAttribute('type');
  if (im === 'tel') log.pass(ACTOR, 'register-driver-inputMode-tel');
  else log.p0(ACTOR, 'register-driver-inputMode-tel', `inputmode="${im}", expected "tel"`);

  if (ac && /tel/.test(ac)) log.pass(ACTOR, 'register-driver-autoComplete-tel');
  else log.p1(ACTOR, 'register-driver-autoComplete-tel', `autocomplete="${ac}"`);

  // type= не обязательно "tel" — у RN-Web TextInput по умолчанию text,
  // но это OK пока inputmode правильный.
  log.info(ACTOR, `register-driver-type=${type}`);
});

test('register client · phone input имеет inputMode="tel"', async ({ page }) => {
  await gotoFresh(page);
  await openRegister(page, 'client');
  const input = page.getByTestId('prem-reg-phone-input');
  await expect(input).toBeVisible({ timeout: 10000 });
  const im = await input.getAttribute('inputmode');
  if (im === 'tel') log.pass(ACTOR, 'register-client-inputMode-tel');
  else log.p0(ACTOR, 'register-client-inputMode-tel', `inputmode="${im}"`);
});

test('login · phone input имеет inputMode="tel"', async ({ page }) => {
  await gotoFresh(page);
  await openLogin(page);
  const input = page.getByTestId('prem-login-phone-input');
  await expect(input).toBeVisible({ timeout: 10000 });
  const im = await input.getAttribute('inputmode');
  if (im === 'tel') log.pass(ACTOR, 'login-inputMode-tel');
  else log.p0(ACTOR, 'login-inputMode-tel', `inputmode="${im}"`);
});

// ─────────────── normalization для разных форматов ──────────────

const FORMATS = [
  { label: 'no-spaces',          raw: '+77479171118' },
  { label: 'with-spaces-plus',   raw: '+7 747 917 11 18' },
  { label: 'leading-8',          raw: '8 747 917 11 18' },
  { label: '10-digits-only',     raw: '7479171118' },
  { label: 'parens-and-dashes',  raw: '+7 (747) 917-11-18' },
  { label: 'fullwidth-unicode',  raw: '＋７７４７９１７１１１８' }, // NFKC должна свернуть
];

for (const f of FORMATS) {
  test(`register driver · paste "${f.label}" нормализуется в +7 747 917 11 18`, async ({ page }) => {
    await gotoFresh(page);
    await openRegister(page, 'driver');
    const input = page.getByTestId('prem-reg-phone-input');
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.click({ force: true });
    await input.fill('');                    // снимаем дефолтный +7
    await input.fill(f.raw);                 // эмулируем paste
    await page.waitForTimeout(300);
    const value = await input.inputValue();
    // Helper нормализует все цифры в +7 7 4 7 …; формат отображения
    // — `+7 747 917 11 18`. Главная проверка: 11 ASCII-цифр внутри.
    const digits = value.replace(/\D/g, '');
    if (digits === '77479171118') {
      log.pass(ACTOR, `paste-${f.label}-normalized-to-canonical`);
    } else {
      log.p0(ACTOR, `paste-${f.label}-normalized-to-canonical`,
        `expected 77479171118, got ${digits} (display="${value}")`);
    }
    // submit-кнопка должна разблокироваться (consent ещё не нажат,
    // поэтому Stage 36 говорит «кнопка ВСЕГДА нажимается». Проверим
    // что submit вызывается без disabled).
    const btn = page.getByTestId('prem-reg-send-code');
    const disabled = await btn.getAttribute('aria-disabled');
    if (disabled !== 'true') log.pass(ACTOR, `paste-${f.label}-button-enabled`);
    else log.p1(ACTOR, `paste-${f.label}-button-enabled`, 'aria-disabled=true');
  });
}

// ─────────────── login: button становится active ──────────────

test('login · после ввода полного номера кнопка active и onSubmit ушёл', async ({ page }) => {
  await gotoFresh(page);
  await openLogin(page);
  const input = page.getByTestId('prem-login-phone-input');
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click({ force: true });
  await input.fill('');
  await input.type('+77479171118', { delay: 20 });
  await page.waitForTimeout(300);
  const value = await input.inputValue();
  const digits = value.replace(/\D/g, '');
  if (digits === '77479171118') log.pass(ACTOR, 'login-typed-phone-normalized');
  else log.p0(ACTOR, 'login-typed-phone-normalized', `got ${digits}`);

  // Тапаем send и ловим mock-ответ — переход на OTP.
  await page.getByTestId('prem-login-send-code').click({ force: true });
  await page.waitForTimeout(1500);
  const otpVisible = await page.getByTestId('prem-reg-otp-input').isVisible({ timeout: 5000 }).catch(() => false);
  if (otpVisible) log.pass(ACTOR, 'login-send-code-navigates-to-otp');
  else log.p0(ACTOR, 'login-send-code-navigates-to-otp', 'OTP screen не открылся');
});

// ─────────────── Unicode digits safety net ──────────────

test('register · arabic-indic digits ١٢٣ нормализуются в 123', async ({ page }) => {
  await gotoFresh(page);
  await openRegister(page, 'driver');
  const input = page.getByTestId('prem-reg-phone-input');
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click({ force: true });
  await input.fill('');
  // ٧٧٤٧٩١٧١١١٨ = 77479171118 в арабских (Arabic-Indic) digits.
  await input.fill('+٧٧٤٧٩١٧١١١٨');
  await page.waitForTimeout(300);
  const value = await input.inputValue();
  const digits = value.replace(/\D/g, '');
  if (digits === '77479171118') log.pass(ACTOR, 'arabic-indic-digits-normalized');
  else log.p0(ACTOR, 'arabic-indic-digits-normalized', `got "${value}" digits="${digits}"`);
});
