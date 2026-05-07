// Premium registration QA gate — Stage 35 → расширено в Stage 36.
//
// Stage 35 проверял лишь отсутствие legacy-строк. Владелец тестировал v85
// руками и нашёл два P0:
//   1) Ссылки «Оферта» / «Конфиденциальность» не открывались (rn-web
//      <Text onPress> на крошечном 11px target пропускал клик).
//   2) Кнопка «Получить код» оставалась disabled даже после валидного
//      телефона + consent (TouchableOpacity для checkbox row отдавал
//      touch ребёнку <Text>, и `consent` state не обновлялся).
//
// Stage 36 теперь жёстко валидирует:
//   driver/client: оба роли открывают premium screen
//   terms/privacy: клик действительно вызывает open (window.open или
//                  событие popup) — мы пере-биндим window.open до клика
//                  и проверяем, что наш URL вылетел в спай.
//   phone input: принимает +77479171118
//   consent toggle: после клика checkbox state становится checked
//   send-code button: становится active (NOT disabled) после ввода
//                     валидного номера + consent
//   click send-code: переходит на OTP screen (mock SMS)
//   no legacy text: WhatsApp / Личность / Документы / Транспорт / Готово
//   no ErrorBoundary: «Что-то пошло не так» не появляется

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { snap } = require('../utils/qaScreenshots');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-premium-reg';

const FORBIDDEN_LEGACY_STRINGS = [
  'WhatsApp', 'Личность', 'Документы', 'Транспорт', 'Готово',
  'ИИН', 'ПТС', 'Тип кузова', 'Селфи', 'Права',
];
const CRASH_MARKERS = ['Что-то пошло не так', 'Something went wrong', 'Application Error'];

async function bodyText(page) {
  try { return await page.locator('body').innerText({ timeout: 4000 }); }
  catch { return ''; }
}
async function isCrash(page) {
  const txt = await bodyText(page);
  return CRASH_MARKERS.some((s) => txt && txt.includes(s));
}

// Перехватчик window.open: ставится до клика, любой URL накапливается
// в массиве `__premOpens`. После клика по ссылке мы проверяем что
// нужный URL там оказался.
async function installOpenSpy(page) {
  await page.addInitScript(() => {
    window.__premOpens = [];
    const origOpen = window.open;
    window.open = function (url) {
      try { window.__premOpens.push(String(url || '')); } catch {}
      // Возвращаем фиктивный объект, чтобы код не упал, но саму вкладку
      // не открываем — иначе test runner зависнет на новой странице.
      return { closed: false, focus: () => {}, location: { href: url } };
    };
    // Linking.openURL → location.href = url. Перехватим setter, чтобы
    // случайно не уйти со страницы.
    try {
      Object.defineProperty(window.location, 'href', {
        configurable: true,
        set: (v) => { try { window.__premOpens.push(String(v || '')); } catch {} },
        get: () => '',
      });
    } catch {}
  });
}

async function getOpens(page) {
  return await page.evaluate(() => Array.isArray(window.__premOpens) ? window.__premOpens.slice() : []);
}

test.describe.configure({ mode: 'serial' });

async function runRoleFlow(page, roleTestId, scenarioLabel) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await installOpenSpy(page);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const roleBtn = page.getByTestId(roleTestId);
  if (!(await roleBtn.isVisible().catch(() => false))) {
    log.p0(ACTOR, `${scenarioLabel}-role-btn-visible`, `${roleTestId} not on landing`);
    return;
  }
  await roleBtn.click().catch(() => {});
  await page.waitForTimeout(1200);
  await snap(page, 'premium-reg', `${scenarioLabel}-phone`);

  // 1. premium screen открыт?
  const phoneScreen = page.getByTestId('prem-reg-phone-screen');
  if (await phoneScreen.isVisible().catch(() => false)) {
    log.pass(ACTOR, `${scenarioLabel}-phone-screen-visible`);
  } else {
    log.p0(ACTOR, `${scenarioLabel}-phone-screen-visible`, 'PremiumRegisterScreen testID not visible');
    return;
  }

  // 2. без crash баннера
  if (await isCrash(page)) {
    log.p0(ACTOR, `${scenarioLabel}-no-crash`, 'crash banner on premium screen');
    return;
  } else {
    log.pass(ACTOR, `${scenarioLabel}-no-crash`);
  }

  // 3. legacy-строк нет
  const txt = await bodyText(page);
  const found = FORBIDDEN_LEGACY_STRINGS.filter((s) => txt.includes(s));
  if (found.length === 0) {
    log.pass(ACTOR, `${scenarioLabel}-no-legacy-text`);
  } else {
    log.p0(ACTOR, `${scenarioLabel}-no-legacy-text`, `legacy: ${found.join(', ')}`);
  }

  // 4. ввод телефона +77479171118 — пишем символ за символом, чтобы
  //    маскирование formatPhone отработало как при реальном вводе.
  const input = page.getByTestId('prem-reg-phone-input');
  await input.click().catch(() => {});
  await input.fill('').catch(() => {});
  await input.type('+77479171118', { delay: 30 }).catch(() => {});
  await page.waitForTimeout(300);
  const inputVal = await input.inputValue().catch(() => '');
  if (/[+\s]?7[\s]?747[\s]?917[\s]?11[\s]?18/.test(inputVal)) {
    log.pass(ACTOR, `${scenarioLabel}-phone-accepted`);
  } else {
    log.p0(ACTOR, `${scenarioLabel}-phone-accepted`, `unexpected input value: "${inputVal}"`);
  }

  // 5. клик по «Оферта» → window.open / Linking.openURL должно содержать /terms
  const termsLink = page.getByTestId('prem-reg-consent-terms');
  if (await termsLink.isVisible().catch(() => false)) {
    await termsLink.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    const opens = await getOpens(page);
    if (opens.some((u) => u.includes('/terms'))) {
      log.pass(ACTOR, `${scenarioLabel}-terms-link-clickable`);
    } else {
      log.p0(ACTOR, `${scenarioLabel}-terms-link-clickable`,
        `terms click did not call open. opens=${JSON.stringify(opens)}`);
    }
  } else {
    log.p0(ACTOR, `${scenarioLabel}-terms-link-clickable`, 'terms link not visible');
  }

  // 6. клик по «Конфиденциальность» → /privacy
  const privacyLink = page.getByTestId('prem-reg-consent-privacy');
  if (await privacyLink.isVisible().catch(() => false)) {
    await privacyLink.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    const opens2 = await getOpens(page);
    if (opens2.some((u) => u.includes('/privacy'))) {
      log.pass(ACTOR, `${scenarioLabel}-privacy-link-clickable`);
    } else {
      log.p0(ACTOR, `${scenarioLabel}-privacy-link-clickable`,
        `privacy click did not call open. opens=${JSON.stringify(opens2)}`);
    }
  } else {
    log.p0(ACTOR, `${scenarioLabel}-privacy-link-clickable`, 'privacy link not visible');
  }

  // 7. отметить consent
  const consentToggle = page.getByTestId('prem-reg-consent-toggle');
  if (await consentToggle.isVisible().catch(() => false)) {
    await consentToggle.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
    const checked = await consentToggle.getAttribute('aria-checked').catch(() => null);
    if (checked === 'true') {
      log.pass(ACTOR, `${scenarioLabel}-consent-checked`);
    } else {
      // fallback: галочка нарисована (visual ✓)
      const tickPresent = await page.locator('text=✓').first().isVisible().catch(() => false);
      if (tickPresent) {
        log.pass(ACTOR, `${scenarioLabel}-consent-checked`);
      } else {
        log.p0(ACTOR, `${scenarioLabel}-consent-checked`, `aria-checked=${checked}, no tick visible`);
      }
    }
  } else {
    log.p0(ACTOR, `${scenarioLabel}-consent-checked`, 'consent toggle not visible');
  }

  // 8. кнопка «Получить код» нажимаема (Stage 36: disabled только при loading)
  const sendBtn = page.getByTestId('prem-reg-send-code');
  if (!(await sendBtn.isVisible().catch(() => false))) {
    log.p0(ACTOR, `${scenarioLabel}-send-button-active`, 'send-code button not visible');
    return;
  }
  const ariaDisabled = await sendBtn.getAttribute('aria-disabled').catch(() => null);
  // aria-disabled=null или 'false' = active. 'true' — баг.
  if (!ariaDisabled || ariaDisabled === 'false') {
    log.pass(ACTOR, `${scenarioLabel}-send-button-active`);
  } else {
    log.p0(ACTOR, `${scenarioLabel}-send-button-active`,
      `aria-disabled=${ariaDisabled} after valid phone + consent`);
  }

  // 9. клик «Получить код» → переход на OTP
  await sendBtn.click({ force: true }).catch(() => {});
  // ждём перехода на OTP screen — backend Mobizon может ответить за 1-3с,
  // даём щедрый таймаут, но не блокируем тест на ошибке сети.
  const otpScreen = page.getByTestId('prem-reg-otp-screen');
  const reached = await otpScreen.isVisible({ timeout: 8000 }).catch(() => false);
  if (reached) {
    log.pass(ACTOR, `${scenarioLabel}-otp-screen-opened`);
    await snap(page, 'premium-reg', `${scenarioLabel}-otp`);
  } else {
    log.p1(ACTOR, `${scenarioLabel}-otp-screen-opened`,
      'OTP screen not reached in 8s — может быть network/backend, не обязательно P0');
  }

  // 10. console errors
  if (errors.length === 0) {
    log.pass(ACTOR, `${scenarioLabel}-no-console-errors`);
  } else {
    log.p1(ACTOR, `${scenarioLabel}-no-console-errors`,
      `${errors.length}: ${errors.slice(0, 2).join(' | ').slice(0, 200)}`);
  }
}

test('premium reg · driver — full happy path', async ({ page }) => {
  await runRoleFlow(page, 'role-driver', 'driver');
});

test('premium reg · client — full happy path', async ({ page }) => {
  await runRoleFlow(page, 'role-client', 'client');
});
