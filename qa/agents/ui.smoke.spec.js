// UI smoke audit — clicks the major surfaces of the public web bundle
// and confirms there are no ErrorBoundary crashes, no JS exceptions,
// and that each filter chip opens its OWN sheet (Direction / Date /
// Body / Price). Auth screens and OTP/Telegram flows are NOT exercised.
//
// The spec is intentionally tolerant of minor layout drift: it uses
// data-testid where available and falls back to text/role matchers.
// A surface is "OK" if it loads without crashing; deep functional
// validation lives in the actor-specific specs (Serik / Boris).

const { test } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { snap } = require('../utils/qaScreenshots');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-ui-smoke';

const CRASH_MARKERS = ['Что-то пошло не так', 'Something went wrong', 'Application Error'];

async function bodyText(page) {
  try { return await page.locator('body').innerText({ timeout: 4000 }); }
  catch { return ''; }
}
async function isCrash(page) {
  const txt = await bodyText(page);
  return CRASH_MARKERS.some((s) => txt && txt.includes(s));
}

test.describe.configure({ mode: 'serial' });

test('UI · landing + role select', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await snap(page, 'ui-smoke', 'landing');
  if (await isCrash(page)) {
    log.p0(ACTOR, 'landing-loads', 'crash banner on /');
  } else {
    log.pass(ACTOR, 'landing-loads');
  }

  // Role pick: Driver branch
  const driverBtn = page.getByText(/Я водитель|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    await snap(page, 'ui-smoke', 'driver-feed');
    if (await isCrash(page)) log.p0(ACTOR, 'driver-feed-loads', 'crash after role pick');
    else log.pass(ACTOR, 'driver-feed-loads');
  } else {
    log.p2(ACTOR, 'driver-feed-loads', 'driver role button not found in current layout');
  }

  if (errors.length) {
    log.p1(ACTOR, 'no-console-errors', `${errors.length} errors: ${errors.slice(0, 3).join(' | ').slice(0, 200)}`);
  } else {
    log.pass(ACTOR, 'no-console-errors');
  }
});

test('UI · filter chips open distinct sheets', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // Make sure we're past role-pick if it gates the feed
  const driverBtn = page.getByText(/Я водитель|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  // Each chip → its own sheet. We assert the OPPOSITE sheets do NOT
  // appear; for instance, clicking Date should not reveal a "Направление"
  // section header at the same time.
  const chipCases = [
    { chip: /🧭|Направление|Direction/i, expect: /Направление|Direction|Откуда|From/i, forbid: [/Тип кузова|Truck type/i, /Сортировка|Sort/i] },
    { chip: /📅|Дата|Date/i,             expect: /Дата|Date|Бастап|Von|Du|YYYY-MM-DD/i, forbid: [/Тип кузова|Truck type/i, /Сортировка|Sort/i, /Направление\b|Direction\b/i] },
    { chip: /🚛|Кузов|Body/i,            expect: /Тип кузова|Truck type|Кузов түрі|LKW-Typ/i, forbid: [/Сортировка|Sort/i, /Направление\b|Direction\b/i] },
    { chip: /💰|Цена|Price/i,            expect: /Сортировка|Sort|Tri|Sortierung/i, forbid: [/Тип кузова|Truck type/i, /Направление\b|Direction\b/i] },
  ];

  for (const c of chipCases) {
    const btn = page.getByText(c.chip).first();
    if (!(await btn.isVisible().catch(() => false))) {
      log.p2(ACTOR, `chip-${c.chip.source}-found`, 'chip not visible in current viewport');
      continue;
    }
    await btn.click().catch(() => {});
    await page.waitForTimeout(700);
    const after = await bodyText(page);
    const opens = c.expect.test(after);
    const leaks = c.forbid.find((re) => re.test(after));
    if (!opens) {
      log.p1(ACTOR, `chip-${c.chip.source}-opens-own-sheet`, `expected ${c.expect}, body=${after.slice(0, 120)}`);
    } else if (leaks) {
      log.p0(ACTOR, `chip-${c.chip.source}-no-leak`, `leaked unrelated section ${leaks}`);
    } else {
      log.pass(ACTOR, `chip-${c.chip.source}-opens-only-its-sheet`);
    }
    // Close: tap outside or press Escape — the BottomSheet wraps a Modal
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
});

test('UI · bottom navigation tabs reachable', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const driverBtn = page.getByText(/Я водитель|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  // Tab labels are localised; match against the four core surfaces
  const tabs = [
    { re: /Лента|Feed|🏠/i,     name: 'Feed' },
    { re: /Маршрут|Track|🚛/i,   name: 'Track' },
    { re: /Кошелек|Wallet|💼/i,  name: 'Wallet' },
    { re: /Профиль|Profile|👤/i, name: 'Profile' },
  ];
  for (const tab of tabs) {
    const tabBtn = page.getByText(tab.re).first();
    if (!(await tabBtn.isVisible().catch(() => false))) {
      log.p2(ACTOR, `tab-${tab.name}-visible`, 'tab not in viewport');
      continue;
    }
    await tabBtn.click().catch(() => {});
    await page.waitForTimeout(900);
    if (await isCrash(page)) {
      log.p0(ACTOR, `tab-${tab.name}-no-crash`, 'crash after tab click');
    } else {
      log.pass(ACTOR, `tab-${tab.name}-no-crash`);
    }
  }
});

test('UI · language selector lists 7 languages and no Uzbek', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const driverBtn = page.getByText(/Я водитель|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  const profile = page.getByText(/Профиль|Profile/i).first();
  if (await profile.isVisible().catch(() => false)) {
    await profile.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  const txt = await bodyText(page);
  const seen = ['Русский', 'Қазақша', '中文', 'English', 'Кыргызча', 'Deutsch', 'Français']
    .filter((n) => txt.includes(n));
  const uzbek = /O'zbek|Узбек|Uzbek/i.test(txt);
  if (uzbek) {
    log.p0(ACTOR, 'no-uzbek-in-selector', 'Uzbek label leaked into language picker');
  }
  if (seen.length >= 4) {
    log.pass(ACTOR, 'language-selector-lists-enabled', `seen: ${seen.join(', ')}`);
  } else {
    log.p2(ACTOR, 'language-selector-lists-enabled', `only ${seen.length}/7 names visible (profile may not be reached without auth)`);
  }
});
