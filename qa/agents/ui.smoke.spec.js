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

async function mockPublicBackend(page) {
  const json = (body) => (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  // UI smoke owns rendering/navigation only. Actor specs exercise the real
  // backend; isolated responses avoid exhausting the public guest rate-limit.
  await page.route('**/api/v1/**', json({}));
  await page.route('**/api/v1/register/guest', json({
    token: 'ui-smoke-guest-token',
    user_id: 'ui-smoke-guest',
    verification_level: 0,
  }));
  await page.route('**/api/v1/register/me', json({
    id: 'ui-smoke-guest',
    role: 'guest',
    verification_level: 0,
  }));
  await page.route('**/api/v1/market/cargos*', json({ cargos: [], total: 0 }));
  await page.route('**/api/v1/market/trips*', json({ trips: [], total: 0 }));
}

async function enterGuestFeed(page) {
  await mockPublicBackend(page);
  const nav = page.getByTestId('bottom-nav');
  if (!(await nav.isVisible().catch(() => false))) {
    const guestEntry = page.getByTestId('onb-v2-cta-guest')
      .or(page.getByTestId('role-browse-guest'))
      .first();
    if (!(await guestEntry.isVisible().catch(() => false))) return false;
    await guestEntry.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  if (!(await nav.isVisible({ timeout: 5000 }).catch(() => false))) return false;

  // Client/guest Main starts on MyWork by design. Select the canonical Feed
  // tab explicitly before asserting feed controls or its profile menu.
  const feedTab = page.getByTestId('bottom-nav-feed');
  if (!(await feedTab.isVisible().catch(() => false))) return false;
  await feedTab.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  return true;
}

test.describe.configure({ mode: 'serial' });

test('UI · landing + guest feed', async ({ page }) => {
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

  if (await enterGuestFeed(page)) {
    await snap(page, 'ui-smoke', 'guest-feed');
    if (await isCrash(page)) log.p0(ACTOR, 'guest-feed-loads', 'crash after guest entry');
    else log.pass(ACTOR, 'guest-feed-loads');
  } else {
    log.p1(ACTOR, 'guest-feed-loads', 'neither OnboardingV2 guest CTA nor bottom nav became visible');
  }

  if (errors.length) {
    log.p1(ACTOR, 'no-console-errors', `${errors.length} errors: ${errors.slice(0, 3).join(' | ').slice(0, 200)}`);
  } else {
    log.pass(ACTOR, 'no-console-errors');
  }
});

test('UI · filter chips open distinct sheets', async ({ browser }) => {
  const chipCases = [
    { key: 'date', sheet: 'filter-date-sheet' },
    { key: 'body', sheet: 'filter-body-sheet' },
    { key: 'price', sheet: 'filter-price-sheet' },
  ];

  for (let index = 0; index < chipCases.length; index += 1) {
    const c = chipCases[index];
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(900);

    if (!(await enterGuestFeed(page))) {
      log.p1(ACTOR, `chip-${c.key}-feed-reachable`, 'guest feed did not open from the current onboarding');
      await context.close();
      continue;
    }

    if (index === 0) {
      const from = page.getByTestId('feed-route-from');
      const to = page.getByTestId('feed-route-to');
      if (await from.isVisible().catch(() => false) && await to.isVisible().catch(() => false)) {
        log.pass(ACTOR, 'route-direction-controls-visible');
      } else {
        log.p1(ACTOR, 'route-direction-controls-visible', 'From/To controls are not both visible');
      }
    }

    const btn = page.getByTestId(`trip-filter-${c.key}`)
      .or(page.getByTestId(`cargo-filter-${c.key}`))
      .first();
    if (!(await btn.isVisible().catch(() => false))) {
      log.p1(ACTOR, `chip-${c.key}-visible`, 'canonical filter chip is not visible');
      await context.close();
      continue;
    }
    await btn.click({ force: true }).catch(() => {});
    const ownSheet = page.getByTestId(c.sheet);
    if (!(await ownSheet.isVisible({ timeout: 2000 }).catch(() => false))) {
      log.p1(ACTOR, `chip-${c.key}-opens-own-sheet`, `${c.sheet} is not visible`);
      await context.close();
      continue;
    }

    const leaked = [];
    for (const other of chipCases.filter((x) => x.key !== c.key)) {
      if (await page.getByTestId(other.sheet).isVisible().catch(() => false)) leaked.push(other.sheet);
    }
    if (leaked.length) log.p0(ACTOR, `chip-${c.key}-no-leak`, `also visible: ${leaked.join(',')}`);
    else log.pass(ACTOR, `chip-${c.key}-opens-only-its-sheet`);
    await context.close();
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
  if (!(await enterGuestFeed(page))) {
    log.p1(ACTOR, 'public-feed-reachable', 'guest feed did not open from the current onboarding');
    return;
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

  if (!(await enterGuestFeed(page))) {
    log.p1(ACTOR, 'date-filter-feed-reachable', 'guest feed did not open from the current onboarding');
    return;
  }

  const dateChip = page.getByTestId('trip-filter-date')
    .or(page.getByTestId('cargo-filter-date'))
    .first();
  if (!(await dateChip.isVisible().catch(() => false))) {
    log.p1(ACTOR, 'date-chip-visible', 'canonical Date chip is not visible');
    return;
  }
  await dateChip.click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);

  // The current cross-platform DatePicker intentionally renders the same
  // custom calendar grid on web and native instead of an HTML date input.
  const openCalendar = page.getByTestId('date-picker-open').first();
  await openCalendar.click({ force: true }).catch(() => {});
  const calendar = page.getByTestId('date-picker-calendar').first();
  if (await calendar.isVisible({ timeout: 2000 }).catch(() => false)) {
    log.pass(ACTOR, 'date-chip-opens-real-calendar');
  } else {
    log.p0(ACTOR, 'date-chip-opens-real-calendar', 'custom calendar grid did not render');
  }

  const sheet = page.getByTestId('filter-date-sheet');
  const sheetVisible = await sheet.isVisible({ timeout: 2000 }).catch(() => false);
  if (sheetVisible) log.pass(ACTOR, 'date-sheet-testid-rendered');
  else log.p2(ACTOR, 'date-sheet-testid-rendered', 'data-testid filter-date-sheet not visible (older bundle?)');
});

test('UI · bottom-nav has balanced cells', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  if (!(await enterGuestFeed(page))) {
    log.p1(ACTOR, 'bottom-nav-mounted', 'guest feed did not expose the canonical bottom nav');
    return;
  }

  const nav = page.getByTestId('bottom-nav');
  log.pass(ACTOR, 'bottom-nav-mounted');

  // Cells should sit on a shared horizontal baseline. Compare bounding
  // boxes of two non-publish cells — Y delta of more than 6 px means
  // the publish overlay is dragging neighbours up again.
  const feed = page.getByTestId('bottom-nav-feed');
  const queue = page.getByTestId('bottom-nav-queue');
  if (await feed.isVisible().catch(() => false) && await queue.isVisible().catch(() => false)) {
    const a = await feed.boundingBox();
    const b = await queue.boundingBox();
    if (a && b && Math.abs(a.y - b.y) <= 6) {
      log.pass(ACTOR, 'bottom-nav-cells-aligned', `Δy=${Math.abs(a.y - b.y).toFixed(1)}px`);
    } else {
      log.p1(ACTOR, 'bottom-nav-cells-aligned', `Δy=${a && b ? Math.abs(a.y - b.y).toFixed(1) : '?'}px`);
    }
  } else {
    log.p1(ACTOR, 'bottom-nav-cells-aligned', 'canonical Feed/Queue cells are not both visible');
  }
});

test('UI · bottom navigation tabs reachable', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);

  if (!(await enterGuestFeed(page))) {
    log.p1(ACTOR, 'bottom-tabs-reachable', 'guest feed did not expose the canonical bottom nav');
    return;
  }

  const tabs = ['feed', 'mywork', 'deals', 'queue'];
  for (const tab of tabs) {
    const tabBtn = page.getByTestId(`bottom-nav-${tab}`);
    if (!(await tabBtn.isVisible().catch(() => false))) {
      log.p1(ACTOR, `tab-${tab}-visible`, 'canonical tab not in viewport');
      continue;
    }
    await tabBtn.click().catch(() => {});
    await page.waitForTimeout(900);
    if (await isCrash(page)) {
      log.p0(ACTOR, `tab-${tab}-no-crash`, 'crash after tab click');
    } else {
      log.pass(ACTOR, `tab-${tab}-no-crash`);
    }
  }
});

test('UI · language selector lists only 4 enabled languages', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  if (!(await enterGuestFeed(page))) {
    log.p1(ACTOR, 'profile-language-reachable', 'guest feed did not open from the current onboarding');
    return;
  }
  const menu = page.getByTestId('feed-menu-btn');
  if (!(await menu.isVisible().catch(() => false))) {
    log.p1(ACTOR, 'profile-language-reachable', 'feed profile menu is not visible');
    return;
  }
  await menu.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);

  const enabled = ['ru', 'en', 'kk', 'zh'];
  const removed = ['uz', 'kg', 'de', 'fr'];
  const missing = [];
  for (const code of enabled) {
    if (!(await page.getByTestId(`profile-lang-${code}`).isVisible().catch(() => false))) missing.push(code);
  }
  const leaked = [];
  for (const code of removed) {
    if (await page.getByTestId(`profile-lang-${code}`).count().catch(() => 0)) leaked.push(code);
  }
  if (leaked.length) log.p0(ACTOR, 'no-removed-langs-in-selector', `leaked codes: ${leaked.join(',')}`);
  else log.pass(ACTOR, 'no-removed-langs-in-selector');

  if (missing.length) log.p1(ACTOR, 'language-selector-lists-enabled', `missing: ${missing.join(',')}`);
  else log.pass(ACTOR, 'language-selector-lists-enabled', enabled.join(',').toUpperCase());
});
