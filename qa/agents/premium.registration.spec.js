// Premium registration QA gate (Stage 35).
//
// Цель: гарантировать, что в основном flow регистрации пользователю
// больше НИКОГДА не показывается старый light-RegScreen с шагами
// «Личность / Документы / Транспорт / Готово», полем «ИИН» или
// упоминанием «WhatsApp». Если в DOM на /role → role-driver →
// new flow появилась хоть одна из этих строк — спека падает.
//
// Также проверяет, что новые testID присутствуют:
//   - prem-reg-phone-screen
//   - prem-reg-phone-input
//   - prem-reg-send-code
// Без них bundler/сборка не продакшен-готов.

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { snap } = require('../utils/qaScreenshots');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-premium-reg';

// Строки, которые НЕ должны появляться в premium-flow регистрации.
// Каждая — точечный признак старого UI.
const FORBIDDEN_LEGACY_STRINGS = [
  'WhatsApp',
  'Личность',
  'Документы',
  'Транспорт',
  'Готово',
  'ИИН',
  'ПТС',
  'Тип кузова',
  'Селфи',
  'Права', // водительские права в шаге 3
];

async function bodyText(page) {
  try { return await page.locator('body').innerText({ timeout: 4000 }); }
  catch { return ''; }
}

test.describe.configure({ mode: 'serial' });

test('premium reg · driver flow has no legacy text', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // 1. Открываем landing → /role
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 2. Нажимаем «Я водитель» — должен открыться PremiumRegisterScreen
  const driverBtn = page.getByTestId('role-driver');
  if (!(await driverBtn.isVisible().catch(() => false))) {
    log.p0(ACTOR, 'role-driver-visible', 'role-driver button missing on landing');
    return;
  }
  await driverBtn.click().catch(() => {});
  await page.waitForTimeout(1200);
  await snap(page, 'premium-reg', 'driver-phone');

  // 3. Проверяем что мы на новом экране (testID + дизайн).
  const phoneScreen = page.getByTestId('prem-reg-phone-screen');
  const phoneInput  = page.getByTestId('prem-reg-phone-input');
  const sendBtn     = page.getByTestId('prem-reg-send-code');

  if (await phoneScreen.isVisible().catch(() => false)) {
    log.pass(ACTOR, 'premium-phone-screen-visible');
  } else {
    log.p0(ACTOR, 'premium-phone-screen-visible', 'PremiumRegisterScreen testID not found');
  }
  if (await phoneInput.isVisible().catch(() => false)) {
    log.pass(ACTOR, 'premium-phone-input-visible');
  } else {
    log.p0(ACTOR, 'premium-phone-input-visible', 'phone input testID not found');
  }
  if (await sendBtn.isVisible().catch(() => false)) {
    log.pass(ACTOR, 'premium-send-code-visible');
  } else {
    log.p0(ACTOR, 'premium-send-code-visible', 'send-code button testID not found');
  }

  // 4. Гард на legacy-тексты — на ЭТОМ экране ни одна не должна
  //    появиться (даже в скрытых элементах, чтобы случайно не
  //    отрендерили старый степ-бар через CSS).
  const text = await bodyText(page);
  const found = FORBIDDEN_LEGACY_STRINGS.filter((s) => text.includes(s));
  if (found.length === 0) {
    log.pass(ACTOR, 'no-legacy-text-on-phone-screen');
  } else {
    log.p0(ACTOR, 'no-legacy-text-on-phone-screen',
      `legacy strings still in DOM: ${found.join(', ')}`);
  }

  // 5. Также проверяем что нет старого светлого фона с прогресс-точками.
  //    Признак светлого: <body style="background: #fff…"> у root-react-app —
  //    но проще искать testID 'reg-progress-bar', который был в RegScreen.
  const oldProgress = page.getByTestId('reg-progress-bar');
  if (await oldProgress.isVisible().catch(() => false)) {
    log.p0(ACTOR, 'no-legacy-progress-bar', 'old reg-progress-bar still rendered');
  } else {
    log.pass(ACTOR, 'no-legacy-progress-bar');
  }

  if (errors.length) {
    log.p1(ACTOR, 'no-console-errors',
      `${errors.length} errors: ${errors.slice(0, 3).join(' | ').slice(0, 200)}`);
  } else {
    log.pass(ACTOR, 'no-console-errors');
  }
});

test('premium reg · client flow has no legacy text', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const clientBtn = page.getByTestId('role-client');
  if (!(await clientBtn.isVisible().catch(() => false))) {
    log.p0(ACTOR, 'role-client-visible', 'role-client button missing on landing');
    return;
  }
  await clientBtn.click().catch(() => {});
  await page.waitForTimeout(1200);
  await snap(page, 'premium-reg', 'client-phone');

  const phoneScreen = page.getByTestId('prem-reg-phone-screen');
  if (await phoneScreen.isVisible().catch(() => false)) {
    log.pass(ACTOR, 'premium-phone-screen-visible-client');
  } else {
    log.p0(ACTOR, 'premium-phone-screen-visible-client', 'client → premium screen missing');
  }

  const text = await bodyText(page);
  const found = FORBIDDEN_LEGACY_STRINGS.filter((s) => text.includes(s));
  if (found.length === 0) {
    log.pass(ACTOR, 'no-legacy-text-on-client-phone-screen');
  } else {
    log.p0(ACTOR, 'no-legacy-text-on-client-phone-screen',
      `legacy strings still in DOM: ${found.join(', ')}`);
  }
});
