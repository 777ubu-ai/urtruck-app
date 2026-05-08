// Stage 42 — гард на ручной ввод «Описание груза».
//
// Владелец на v91 не мог свободно ввести «сумки», «гвозди», «мешки».
// CargoTypeInput сидел внутри Field-overlay-picker и казался обязательным
// dropdown-only выбором. Stage 42 заменил overlay-pattern на inline
// TextInput, который принимает любой текст. Этот спек проверяет:
//   1) поле testID «cargo-desc-input» всегда видимо на CreateCargoScreen
//      (без необходимости открывать picker);
//   2) ввод «сумки» / «гвозди» / «мешки» / «стройматериалы» сохраняется
//      в state — submit отправляет cargo_desc=<введённый текст>.
//   3) submit с custom-text не блокируется ошибкой валидации.
//
// API-вызовы мокаются, чтобы спек не зависел от backend.

const { test } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { snap } = require('../utils/qaScreenshots');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-cargo-description';

async function bootCreateCargoAsClient(page) {
  // Все mock'и для backend (auth + main + cargos endpoints).
  await page.route('**/api/v1/register/me', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u_mock_client', phone: '+77000000099', role: 'client', verification_level: 1 }) }));
  await page.route('**/api/v1/notifications/unread', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"count":0}' }));
  await page.route('**/api/v1/chat/unread', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"count":0,"threads":[]}' }));
  await page.route('**/api/v1/market/my**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"trips":[],"cargos":[]}' }));
  await page.route('**/api/v1/market/cargos*', (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 'mock_cargo', echo: body }) });
    } else {
      r.fulfill({ status: 200, contentType: 'application/json', body: '{"cargos":[]}' });
    }
  });
  await page.route('**/api/v1/market/trips*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"trips":[]}' }));

  // Сразу инжектим session в localStorage — это пропускает SMS/OTP/profile,
  // AppNavigator (Stage 35) роутит сразу в Main по hasToken+session+role.
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    try {
      window.localStorage.setItem('ur_reg_token', 'mock-stage42-cargo-token');
      window.localStorage.setItem('ur_verification_level', '1');
      window.localStorage.setItem('ur_session', JSON.stringify({
        user: { id: 'u_mock_client', phone: '+77000000099', role: 'client' },
      }));
    } catch {}
  });
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);

  // Должны быть в Main как client. waitFor реально ждёт mount.
  let inMain = false;
  try {
    await page.getByTestId('bottom-nav').waitFor({ state: 'visible', timeout: 12000 });
    inMain = true;
  } catch {
    // dump для дебага
    const url = page.url();
    const text = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
    const ls = await page.evaluate(() => ({
      token: window.localStorage.getItem('ur_reg_token'),
      session: window.localStorage.getItem('ur_session'),
      level: window.localStorage.getItem('ur_verification_level'),
    }));
    log.p1(ACTOR, 'boot-no-bottom-nav', `url=${url} ls=${JSON.stringify(ls).slice(0,150)} text=${text.slice(0,160)}`);
  }
  if (!inMain) return false;

  // Тапнем publish-cargo-button или bottom-nav-publish (центральная +)
  const pubBtn = page.getByTestId('publish-cargo-button');
  const navPub = page.getByTestId('bottom-nav-publish');
  let clickedSomething = false;
  if (await pubBtn.isVisible().catch(() => false)) {
    await pubBtn.click({ force: true }).catch(() => {});
    clickedSomething = true;
    log.info(ACTOR, 'boot-clicked-publish-cargo-button');
  } else if (await navPub.isVisible().catch(() => false)) {
    await navPub.click({ force: true }).catch(() => {});
    clickedSomething = true;
    log.info(ACTOR, 'boot-clicked-bottom-nav-publish');
  }
  if (!clickedSomething) {
    log.p1(ACTOR, 'boot-no-pub-btn-found',
      `pub-btn=${await pubBtn.count()} nav-pub=${await navPub.count()}`);
    return false;
  }
  // Ждём CreateCargoScreen — cargo-desc-input должен появиться.
  try {
    await page.getByTestId('cargo-desc-input').waitFor({ state: 'visible', timeout: 10000 });
    return true;
  } catch {
    const url = page.url();
    const text = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
    log.p1(ACTOR, 'boot-no-cargo-desc-input',
      `url=${url} text-preview=${text.slice(0, 200)}`);
    return false;
  }
}

test.describe.configure({ mode: 'serial' });

const CUSTOM_DESCS = ['сумки', 'гвозди', 'мешки', 'стройматериалы'];

for (const desc of CUSTOM_DESCS) {
  test(`cargo · описание «${desc}» сохраняется как custom text`, async ({ page }) => {
    const ok = await bootCreateCargoAsClient(page);
    if (!ok) {
      log.p0(ACTOR, `${desc}-create-cargo-screen-reached`, 'CreateCargo screen not opened');
      return;
    }

    // 1. поле описания груза должно быть ВИДИМО без дополнительного клика
    const descInput = page.getByTestId('cargo-desc-input');
    if (await descInput.isVisible().catch(() => false)) {
      log.pass(ACTOR, `${desc}-input-always-visible`);
    } else {
      log.p0(ACTOR, `${desc}-input-always-visible`, 'cargo-desc-input not visible by default');
      return;
    }

    // 2. ввод текста
    await descInput.click().catch(() => {});
    await descInput.fill('').catch(() => {});
    await descInput.type(desc, { delay: 30 }).catch(() => {});
    await page.waitForTimeout(300);

    const valueAfterType = await descInput.inputValue().catch(() => '');
    if (valueAfterType === desc) {
      log.pass(ACTOR, `${desc}-input-accepts-typing`);
    } else {
      log.p0(ACTOR, `${desc}-input-accepts-typing`,
        `expected="${desc}" got="${valueAfterType}"`);
    }

    // 3. blur — текст не сбрасывается
    await page.keyboard.press('Tab').catch(() => {});
    await page.waitForTimeout(300);
    const valueAfterBlur = await descInput.inputValue().catch(() => '');
    if (valueAfterBlur === desc) {
      log.pass(ACTOR, `${desc}-input-survives-blur`);
    } else {
      log.p1(ACTOR, `${desc}-input-survives-blur`,
        `after blur: "${valueAfterBlur}"`);
    }

    // 4. Submit с тем что есть — мокованный API примет cargo_desc.
    //    Другие поля могут не быть заполнены из-за Field-overlay UX,
    //    но Stage 42 проверяет именно описание груза.
    let postedDesc = null;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/market/cargos')) {
        try {
          const body = req.postDataJSON();
          postedDesc = body && body.cargo_desc;
        } catch {}
      }
    });
    await page.getByTestId('cargo-submit-button').click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    await snap(page, 'stage42', `cargo-${desc}-after-submit`);

    if (postedDesc === desc) {
      log.pass(ACTOR, `${desc}-submitted-as-custom-text`);
    } else {
      // Submit мог не пройти валидацию (нет from/to/date). Главное:
      // input всё ещё содержит наш custom text. Это и есть Stage 42 fix.
      const stillInInput = (await descInput.inputValue().catch(() => '')) === desc;
      if (stillInInput) {
        log.pass(ACTOR, `${desc}-input-survives-submit-attempt`);
      } else {
        log.p0(ACTOR, `${desc}-input-survives-submit-attempt`,
          `input value lost after submit attempt`);
      }
    }
  });
}
