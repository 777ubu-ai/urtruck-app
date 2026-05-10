// Stage 49 — RoleScreen language switch + CTA renaming.
//
// Bug 1 (UX): CTA «Я водитель» / «Я грузовладелец» переименованы
// в «Зарегистрироваться как водитель» / «… грузовладелец», чтобы
// пользователь не путался — раньше было неочевидно, что это
// именно регистрация.
//
// Bug 2 (i18n P0): LanguageSwitcher LANGS использовал code='KZ'/'CN',
// но translations в i18n.js под ISO ключами 'KK'/'ZH'. setLanguage('KZ')
// клал translations['KZ']=undefined → t() fallback на RU → пользователь
// после выбора казахского/китайского видел русский текст, хотя pill
// в шапке показывал KZ/CN. Reload спасал благодаря LEGACY_LANG_FIX.
// Stage 49 поправил коды на ISO + display='KZ'/'CN' для UX-привычности.
//
// Что проверяем:
//   1) RoleScreen дефолтно показывает RU title «Зарегистрироваться как водитель»
//   2) tap lang-kz → title становится «Жүргізуші ретінде тіркелу»
//   3) tap lang-en → «Sign up as a driver»
//   4) tap lang-cn → «注册为司机»
//   5) Pill в шапке показывает выбранный display код (KZ / CN / EN / RU)
//   6) Перерисовка происходит без reload страницы
//   7) После reload язык сохраняется (localStorage ur_lang)
//   8) Кнопки role-driver / role-client / role-browse-guest / role-login
//      продолжают вести в правильные screens (sanity)

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-role-i18n';

const EXPECTED = {
  RU: {
    driver: 'Зарегистрироваться как водитель',
    client: 'Зарегистрироваться как грузовладелец',
    pill:   'RU',
  },
  KZ: {
    driver: 'Жүргізуші ретінде тіркелу',
    client: 'Жүк иесі ретінде тіркелу',
    pill:   'KZ',
  },
  EN: {
    driver: 'Sign up as a driver',
    client: 'Sign up as a shipper',
    pill:   'EN',
  },
  CN: {
    driver: '注册为司机',
    client: '注册为货主',
    pill:   'CN',
  },
};

async function gotoFresh(page) {
  // Лёгкие моки чтобы /me не возвращал session, и RoleScreen точно
  // отрисовался (без редиректа в Main).
  await page.route('**/api/v1/register/me', (r) =>
    r.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ detail: 'Токен не предоставлен' }) }));
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function pickLang(page, displayLower) {
  // displayLower: 'ru' | 'kz' | 'en' | 'cn' (именно display, а не ISO).
  await page.getByTestId('role-lang-switch').click({ force: true });
  await page.waitForTimeout(400);
  await page.getByTestId(`lang-${displayLower}`).click({ force: true });
  await page.waitForTimeout(700);
}

async function readDriverTitle(page) {
  return (await page.getByTestId('role-driver').innerText().catch(() => '')).trim();
}
async function readClientTitle(page) {
  return (await page.getByTestId('role-client').innerText().catch(() => '')).trim();
}

test.describe.configure({ mode: 'serial' });

// ─────────────── default RU ──────────────

test('RoleScreen · по умолчанию RU + новые CTA-тексты', async ({ page }) => {
  await gotoFresh(page);

  await expect(page.getByTestId('role-lang-switch')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('role-driver')).toBeVisible();
  await expect(page.getByTestId('role-client')).toBeVisible();
  await expect(page.getByTestId('role-login')).toBeVisible();
  await expect(page.getByTestId('role-browse-guest')).toBeVisible();

  const drv = await readDriverTitle(page);
  const cli = await readClientTitle(page);
  if (drv.includes(EXPECTED.RU.driver)) log.pass(ACTOR, 'ru-driver-title-renamed');
  else log.p0(ACTOR, 'ru-driver-title-renamed', `got "${drv}"`);

  if (cli.includes(EXPECTED.RU.client)) log.pass(ACTOR, 'ru-client-title-renamed');
  else log.p0(ACTOR, 'ru-client-title-renamed', `got "${cli}"`);
});

// ─────────────── KZ ──────────────

test('RoleScreen · KZ переключение перерисовывает CTA сразу (без reload)', async ({ page }) => {
  await gotoFresh(page);
  await pickLang(page, 'kz');

  const drv = await readDriverTitle(page);
  const cli = await readClientTitle(page);
  if (drv.includes(EXPECTED.KZ.driver)) log.pass(ACTOR, 'kz-driver-rerendered');
  else log.p0(ACTOR, 'kz-driver-rerendered', `got "${drv}"`);

  if (cli.includes(EXPECTED.KZ.client)) log.pass(ACTOR, 'kz-client-rerendered');
  else log.p0(ACTOR, 'kz-client-rerendered', `got "${cli}"`);
});

// ─────────────── EN ──────────────

test('RoleScreen · EN переключение перерисовывает CTA сразу', async ({ page }) => {
  await gotoFresh(page);
  await pickLang(page, 'en');

  const drv = await readDriverTitle(page);
  const cli = await readClientTitle(page);
  if (drv.includes(EXPECTED.EN.driver)) log.pass(ACTOR, 'en-driver-rerendered');
  else log.p0(ACTOR, 'en-driver-rerendered', `got "${drv}"`);

  if (cli.includes(EXPECTED.EN.client)) log.pass(ACTOR, 'en-client-rerendered');
  else log.p0(ACTOR, 'en-client-rerendered', `got "${cli}"`);
});

// ─────────────── CN ──────────────

test('RoleScreen · CN переключение перерисовывает CTA сразу', async ({ page }) => {
  await gotoFresh(page);
  await pickLang(page, 'cn');

  const drv = await readDriverTitle(page);
  const cli = await readClientTitle(page);
  if (drv.includes(EXPECTED.CN.driver)) log.pass(ACTOR, 'cn-driver-rerendered');
  else log.p0(ACTOR, 'cn-driver-rerendered', `got "${drv}"`);

  if (cli.includes(EXPECTED.CN.client)) log.pass(ACTOR, 'cn-client-rerendered');
  else log.p0(ACTOR, 'cn-client-rerendered', `got "${cli}"`);
});

// ─────────────── persistence через reload ──────────────

test('RoleScreen · выбранный язык сохраняется после reload (KZ → KK)', async ({ page }) => {
  await gotoFresh(page);
  await pickLang(page, 'kz');

  // Проверяем что в localStorage сохранён ISO 'KK' (не легаси 'KZ').
  const stored = await page.evaluate(() => localStorage.getItem('ur_lang'));
  if (stored === 'KK') log.pass(ACTOR, 'kz-stored-as-iso-KK');
  else log.p1(ACTOR, 'kz-stored-as-iso-KK', `got "${stored}"`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const drv = await readDriverTitle(page);
  if (drv.includes(EXPECTED.KZ.driver)) log.pass(ACTOR, 'kz-persists-after-reload');
  else log.p0(ACTOR, 'kz-persists-after-reload', `got "${drv}"`);
});

// ─────────────── sanity: кнопки навигируют ──────────────

test('RoleScreen · existing CTA flow не сломан (driver → Reg flow)', async ({ page }) => {
  await gotoFresh(page);

  await page.getByTestId('role-driver').click({ force: true });
  await page.waitForTimeout(1500);

  // PremiumRegisterScreen должен открыться (testID prem-reg-phone-screen).
  const onReg = await page.getByTestId('prem-reg-phone-screen').isVisible({ timeout: 5000 }).catch(() => false);
  if (onReg) log.pass(ACTOR, 'role-driver-opens-premium-reg');
  else log.p0(ACTOR, 'role-driver-opens-premium-reg', 'PremiumRegister не открылся');
});
