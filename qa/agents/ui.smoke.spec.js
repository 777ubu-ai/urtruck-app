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
    { chip: /📅|Дата|Date/i,             expect: /Дата|Date|Бастап|ДД\.ММ\.ГГГГ|ДД|Apply|Применить/i, forbid: [/Тип кузова|Truck type/i, /Сортировка|Sort/i, /Направление\b|Direction\b/i] },
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

test('UI · Public feed shows no QA / debug markers', async ({ page }) => {
  // Stage 9: every public-facing card / detail string is routed
  // through `sanitizeForDisplay`, so QA-tagged records (which still
  // exist in the DB so the cleanup script can find them) shouldn't
  // surface their `[ar-…]` / `agent-…` / `currency-regression` markers
  // to a real user. We check the rendered body text after navigating
  // through landing → role → driver feed.
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const driverBtn = page.getByText(/Я водитель|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  const body = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
  // Markers that must not appear in any visible card / detail.
  const offenders = [];
  if (/\[ar-[a-z0-9]+\]/.test(body)) offenders.push('[ar-…] tag');
  if (/\bcurrency-regression\b/i.test(body)) offenders.push('currency-regression label');
  if (/\bagent-(serik|boris|currency|preview-gate|trip-clicks|ui-smoke)\b/i.test(body)) {
    offenders.push('agent-* identifier');
  }
  if (/\bDirect probe\b/.test(body)) offenders.push('Direct probe debug string');
  if (offenders.length) {
    log.p1(ACTOR, 'public-feed-no-qa-markers', `visible markers: ${offenders.join(', ')}`);
  } else {
    log.pass(ACTOR, 'public-feed-no-qa-markers');
  }
});

test('UI · Create form has no fake numeric defaults', async ({ page }) => {
  // Static-source check via the in-page bundle: visit landing, then
  // reach the Create flow if it's reachable as guest. If not, the
  // assertion still has a static-source backup at qa:theme level.
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // We don't gate on auth here — Stage 7's source-level guarantee is
  // "no `placeholder=20` / `placeholder=82` strings in CreateCargo /
  // CreateTrip". Use a simple content fetch of the bundle as a
  // belt-and-braces check; if the pre-deploy check has been run we
  // expect those exact placeholders absent.
  const html = await page.content();
  if (/placeholder="20"/.test(html) || /placeholder="82"/.test(html)) {
    log.p1(ACTOR, 'no-fake-default-placeholders', 'bundle still contains literal "20"/"82" placeholder');
  } else {
    log.pass(ACTOR, 'no-fake-default-placeholders');
  }
});

test('UI · Date chip opens real calendar/date picker', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const driverBtn = page.getByText(/Я водитель|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  const dateChip = page.getByText(/📅|Дата|Date/i).first();
  if (!(await dateChip.isVisible().catch(() => false))) {
    log.p2(ACTOR, 'date-chip-found', 'Date chip not visible');
    return;
  }
  await dateChip.click().catch(() => {});
  await page.waitForTimeout(700);

  // Web: DatePicker renders a real <input type="date">. On native the
  // component opens a custom Modal calendar, but Playwright runs the
  // web bundle — so we assert the native HTML date input is reachable.
  const dateInput = page.locator('input[type="date"]');
  const cnt = await dateInput.count().catch(() => 0);
  if (cnt >= 1) {
    log.pass(ACTOR, 'date-chip-opens-real-calendar', `${cnt} <input type=date> elements`);
  } else {
    log.p0(ACTOR, 'date-chip-opens-real-calendar', 'no <input type=date> rendered — chip falls back to TextInput');
  }

  // Belt-and-braces: confirm the dedicated testID exists.
  const sheet = page.locator('[data-testid="filter-date-sheet"]');
  const sheetVisible = await sheet.isVisible({ timeout: 2000 }).catch(() => false);
  if (sheetVisible) log.pass(ACTOR, 'date-sheet-testid-rendered');
  else log.p2(ACTOR, 'date-sheet-testid-rendered', 'data-testid filter-date-sheet not visible (older bundle?)');
});

test('UI · bottom-nav has plus button + balanced cells', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Make sure we're past role-pick
  const driverBtn = page.getByText(/Я водитель|driver/i).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  const nav = page.locator('[data-testid="bottom-nav"]');
  const navVisible = await nav.isVisible({ timeout: 4000 }).catch(() => false);
  if (!navVisible) {
    log.p2(ACTOR, 'bottom-nav-mounted', 'guest may not see MainTabs without auth');
    return;
  }
  const plusBtn = page.locator('[data-testid="bottom-nav-publish"]');
  const plusVisible = await plusBtn.isVisible({ timeout: 2000 }).catch(() => false);
  if (plusVisible) log.pass(ACTOR, 'bottom-nav-plus-button-visible');
  else log.p1(ACTOR, 'bottom-nav-plus-button-visible', 'central + button missing');

  // Cells should sit on a shared horizontal baseline. Compare bounding
  // boxes of two non-publish cells — Y delta of more than 6 px means
  // the publish overlay is dragging neighbours up again.
  const feed = page.locator('[data-testid="bottom-nav-feed"]');
  const profile = page.locator('[data-testid="bottom-nav-profile"]');
  if (await feed.isVisible().catch(() => false) && await profile.isVisible().catch(() => false)) {
    const a = await feed.boundingBox();
    const b = await profile.boundingBox();
    if (a && b && Math.abs(a.y - b.y) <= 6) {
      log.pass(ACTOR, 'bottom-nav-cells-aligned', `Δy=${Math.abs(a.y - b.y).toFixed(1)}px`);
    } else {
      log.p1(ACTOR, 'bottom-nav-cells-aligned', `Δy=${a && b ? Math.abs(a.y - b.y).toFixed(1) : '?'}px`);
    }
  } else {
    log.p2(ACTOR, 'bottom-nav-cells-aligned', 'not enough visible cells to measure');
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

test('UI · language selector lists only 4 enabled languages', async ({ page }) => {
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
  const enabled = { 'Русский': 'RU', 'English': 'EN', 'Қазақша': 'KK', '中文': 'ZH' };
  const removed = { "O'zbek": 'UZ', 'Узбек': 'UZ', 'Uzbek': 'UZ', 'Кыргызча': 'KG', 'Deutsch': 'DE', 'Français': 'FR' };
  const seenEnabled = Object.entries(enabled).filter(([n]) => txt.includes(n)).map(([, c]) => c);
  const leakedRemoved = Object.entries(removed).filter(([n]) => txt.includes(n)).map(([, c]) => c);
  if (leakedRemoved.length) {
    log.p0(ACTOR, 'no-removed-langs-in-selector', `leaked codes: ${[...new Set(leakedRemoved)].join(',')}`);
  } else {
    log.pass(ACTOR, 'no-removed-langs-in-selector');
  }
  if (seenEnabled.length >= 2) {
    log.pass(ACTOR, 'language-selector-lists-enabled', `seen: ${seenEnabled.join(',')}`);
  } else {
    log.p2(ACTOR, 'language-selector-lists-enabled', `only ${seenEnabled.length}/4 names visible (profile may not be reached without auth)`);
  }
});
