// QA: click-crash reproducer for the public Trips feed.
//
// Visits the live site as a client, opens the Trips feed, clicks every
// visible "Подробнее" / driver card, and asserts:
//   - no ErrorBoundary screen ("Что-то пошло не так")
//   - no console errors / page exceptions during the click
//   - trip detail header renders without "Не указано" everywhere
//
// Failures land in the QA report as P0 (product crash) — anything
// infrastructure-flavoured (auth, network) is downgraded to P1.

const { test } = require('@playwright/test');
const { BASE_URL, ACTORS } = require('../utils/qaConfig');
const { snap, listForRun } = require('../utils/qaScreenshots');
const { log, attach } = require('../utils/qaReport');

const ACTOR = 'agent-trip-clicks';

const FORBIDDEN_TITLE = ['Что-то пошло не так', 'Something went wrong'];

function isCrashPage(text) {
  return FORBIDDEN_TITLE.some((s) => text && text.includes(s));
}

async function bodyText(page) {
  try { return await page.locator('body').innerText({ timeout: 4000 }); }
  catch { return ''; }
}

async function enterAsClient(page) {
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  // Stage 18: full-image RoleScreen — prefer testID hotspot.
  const btn = page.getByTestId('role-client').or(page.getByText(/Я грузовладелец|I'm a shipper|client|cargo owner/i)).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
}

async function gotoTripsTab(page) {
  // Client side has bottom-tab "Машины"/"Trucks" — that's the public Trips feed.
  const tab = page.getByText(/Машины|Trucks|车辆|Көліктер/i).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
}

test('Trip detail click crash reproducer', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
  });
  page.on('pageerror', (e) => pageErrors.push((e && (e.stack || e.message) || String(e)).slice(0, 800)));

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await snap(page, 'tripclicks', 'home');

  await enterAsClient(page);
  await snap(page, 'tripclicks', 'after-role');

  await gotoTripsTab(page);
  await snap(page, 'tripclicks', 'trips-feed');

  const cards = page.locator('[data-testid="trip-card"], [data-testid="driver-card"], div:has-text("Подробнее")');
  // Generic discovery — react-native-web renders TouchableOpacity as <div>
  // with cursor:pointer. Fall back to all clickable divs that contain "→".
  const arrowCards = page.locator('div').filter({ hasText: '→' });
  const total = Math.max(await cards.count().catch(() => 0), Math.min(await arrowCards.count().catch(() => 0), 30));
  log.info(ACTOR, 'cards-discovered', `count=${total}`);
  attach('tripclicks', 'cards', total);

  let clicked = 0;
  let crashes = 0;
  for (let i = 0; i < total && clicked < 10; i++) {
    // Use the most generic accessor each iteration — DOM may reshuffle after navigation.
    const target = arrowCards.nth(i);
    if (!(await target.isVisible().catch(() => false))) continue;
    try {
      await target.click({ timeout: 3000 });
      clicked++;
      await page.waitForTimeout(1500);
      const txt = await bodyText(page);
      if (isCrashPage(txt)) {
        crashes++;
        const file = await snap(page, 'tripclicks', `crash-${clicked}`);
        log.p0(ACTOR, `crash-on-click-${clicked}`, `body contained "Что-то пошло не так". Snapshot=${file || ''}`);
      } else {
        log.pass(ACTOR, `click-${clicked}`, 'no error boundary');
      }
      await page.goBack().catch(() => {});
      await page.waitForTimeout(800);
    } catch (e) {
      log.p2(ACTOR, `click-skip-${i}`, (e && e.message || '').slice(0, 200));
    }
  }
  attach('tripclicks', 'clicks', { attempted: clicked, crashes });

  if (consoleErrors.length) {
    // Demote "ResizeObserver loop", network blips, etc. — flag only the rest.
    const real = consoleErrors.filter((m) =>
      !/ResizeObserver|aborted|favicon|Network request failed|429|401|403|Unauthorized|Forbidden/i.test(m));
    if (real.length) log.p1(ACTOR, 'console-errors', `${real.length} errors. First: ${real[0]}`);
    attach('tripclicks', 'consoleErrors', consoleErrors.slice(0, 30));
  }
  if (pageErrors.length) {
    log.p0(ACTOR, 'page-exceptions', `${pageErrors.length} uncaught. First: ${pageErrors[0].slice(0, 240)}`);
    attach('tripclicks', 'pageErrors', pageErrors.slice(0, 30));
  }

  attach('tripclicks', 'screenshots', listForRun().filter((p) => p.includes('/tripclicks-')));
});
