// Stage 12: reproducer for the production crash report —
// "shipper opens the trips list and clicks 'Подробнее' on a trip
// card and lands on the ErrorBoundary screen 'Что-то пошло не так'".
//
// trip.detail.clicks.spec.js already does similar work, but it
// runs against the discovery heuristic and may quietly skip the
// click when no element matches. This spec is louder: pulls a
// real trip id from /market/trips, navigates directly to
// /trip/<id>?role=client, captures pageerror exceptions, body
// text, screenshot — and fails P0 on the first crash.

const { test } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const qaApi = require('../utils/qaApi');
const { snap } = require('../utils/qaScreenshots');
const { log, attach } = require('../utils/qaReport');

const ACTOR = 'agent-shipper-trip-crash';

const CRASH_MARKERS = ['Что-то пошло не так', 'Something went wrong', 'Application Error'];
function isCrashPage(text) { return CRASH_MARKERS.some((s) => text && text.includes(s)); }

test('Shipper · TripDetail does not crash on Подробнее', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(((e && (e.stack || e.message)) || String(e)).slice(0, 800)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // 1) Get a real trip id from the prod feed.
  const list = await qaApi.get('/market/trips', { query: { status: 'active', limit: 5 } });
  const trips = (list.json && list.json.trips) || [];
  if (!trips.length) {
    log.p2(ACTOR, 'no-trip-on-feed', 'feed empty after cleanup; cannot reproduce');
    return;
  }
  attach('shipper-trip-crash', 'pickedTripId', trips[0].id);

  // 2) Open the bundled web app, walk through role-pick as a
  //    shipper, click into the trips feed and tap the first card.
  //    We don't try to deep-link by URL because the SPA router
  //    needs the AuthProvider boot path to settle.
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await snap(page, 'shipper-trip-crash', 'home');

  // Legacy builds expose the shipper role directly. Current builds enter
  // the public feed through OnboardingV2, then use the Cargos/Trips toggle.
  const shipper = page.getByTestId('role-client').first();
  const guest = page.getByTestId('onb-v2-cta-guest').first();
  if (await shipper.isVisible().catch(() => false)) {
    await shipper.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
  } else if (await guest.isVisible().catch(() => false)) {
    await guest.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    const tripsTab = page.getByTestId('guest-tab-trips');
    if (await tripsTab.isVisible().catch(() => false)) {
      await tripsTab.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    log.pass(ACTOR, 'current-onboarding-guest-entry');
  } else {
    log.p1(ACTOR, 'entry-surface-visible', 'neither OnboardingV2 nor legacy shipper role is visible');
  }
  await snap(page, 'shipper-trip-crash', 'after-entry');

  // Locate any trip card (data-testid added by FeedScreen) or the
  // generic "Подробнее" button text.
  const tripCard = page.locator('[data-testid="trip-card"]').first();
  const detailsBtn = page.getByText(/Подробнее|Details|Толығырақ|详情/i).first();

  let tappedSomething = false;
  if (await tripCard.isVisible().catch(() => false)) {
    await tripCard.click().catch(() => {});
    tappedSomething = true;
  } else if (await detailsBtn.isVisible().catch(() => false)) {
    await detailsBtn.click().catch(() => {});
    tappedSomething = true;
  } else {
    log.info(ACTOR, 'card-click-path', 'no trip card in the current viewport; authoritative tripId deeplink runs next');
  }

  if (tappedSomething) {
    await page.waitForTimeout(2000);
    await snap(page, 'shipper-trip-crash', 'after-click');
    const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (isCrashPage(body)) {
      log.p0(ACTOR, 'shipper-trip-detail-no-crash', `ErrorBoundary visible: ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
    } else {
      log.pass(ACTOR, 'shipper-trip-detail-no-crash');
    }
  }

  // Stage 12 reproducer for the *real* crash path: open TripDetail
  // by `tripId` only, without a pre-loaded trip object. This is what
  // happens when the shipper enters from a push notification or from
  // MyTripsScreen → Orders. `normalizeTrip(null)` returns null and
  // the screen used to dereference `trip.id` immediately on mount.
  //
  // We hit it via Linking-style URL parameter; AppNavigator routes
  // /trip/<id> into TripDetail with route.params = { tripId }.
  const id = trips[0].id;
  await page.goto(`${BASE_URL}#/trip/${encodeURIComponent(id)}`,
    { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const deepBody = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (isCrashPage(deepBody)) {
    log.p0(ACTOR, 'shipper-tripid-deeplink-no-crash', 'TripDetail crashed when opened by tripId only (no rawTrip)');
    await snap(page, 'shipper-trip-crash', 'deeplink-crash');
  } else {
    log.pass(ACTOR, 'shipper-tripid-deeplink-no-crash');
  }

  // Always surface uncaught exceptions — they are the real crash
  // even if the ErrorBoundary somehow didn't render.
  if (pageErrors.length) {
    log.p0(ACTOR, 'page-exceptions', `${pageErrors.length} uncaught. First: ${pageErrors[0].slice(0, 280)}`);
    attach('shipper-trip-crash', 'pageErrors', pageErrors.slice(0, 10));
  }
  const realConsoleErrors = consoleErrors.filter((m) =>
    !/ResizeObserver|aborted|favicon|Network request failed|429|401|403|404/i.test(m));
  if (realConsoleErrors.length) {
    log.p1(ACTOR, 'console-errors', `${realConsoleErrors.length} errors. First: ${realConsoleErrors[0].slice(0, 240)}`);
    attach('shipper-trip-crash', 'consoleErrors', realConsoleErrors.slice(0, 10));
  }
});
