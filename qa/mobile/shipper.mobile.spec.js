// Mobile lane — shipper flow. Stage 14.
//
// Mirrors driver.mobile.spec but with the shipper role and the
// trip-detail-no-crash regression that bit production in Stage 12.
// Specifically:
//   * "Я грузовладелец" tile reachable on small viewport;
//   * trip card click opens TripDetail without ErrorBoundary;
//   * sticky "Предложить цену" CTA on TripDetail is in viewport
//     (the same trip-sticky-bid testID Stage 10 added);
//   * tripId-only deep-link path also doesn't crash.

const { test } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const qaApi = require('../utils/qaApi');
const { BASE_URL } = require('../utils/qaConfig');
const { isCrashPage, bodyText, gotoLanding, pickRole, isLaidOut, isInViewport } = require('./_helpers');

const ACTOR = 'agent-mobile-shipper';

test('Mobile · Shipper landing renders cleanly', async ({ page }) => {
  await gotoLanding(page);
  // Stage 18: full-image RoleScreen — prefer testID hotspot.
  const shipperBtn = page.getByTestId('role-client').or(page.getByText(/Я грузовладелец|I'm a shipper|cargo owner|client/i)).first();
  if (await isLaidOut(shipperBtn) && await isInViewport(page, shipperBtn)) {
    log.pass(ACTOR, 'shipper-tile-on-screen');
  } else {
    log.p1(ACTOR, 'shipper-tile-on-screen', 'shipper role tile clipped or off-screen on mobile');
  }
});

test('Mobile · Shipper feed → TripDetail → sticky CTA visible', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push((e?.message || String(e)).slice(0, 200)));

  await gotoLanding(page);
  await pickRole(page, 'shipper');

  const tripCard = page.locator('[data-testid="trip-card"]').first();
  if (!(await isLaidOut(tripCard))) {
    log.p2(ACTOR, 'trip-card-mounted', 'no trip card visible on this run');
    return;
  }
  log.pass(ACTOR, 'trip-card-mounted');

  await tripCard.click().catch(() => {});
  await page.waitForTimeout(2000);
  const txt = await bodyText(page);
  if (isCrashPage(txt)) {
    log.p0(ACTOR, 'trip-detail-no-crash', 'ErrorBoundary visible on mobile trip-detail');
    return;
  }
  log.pass(ACTOR, 'trip-detail-no-crash');

  const sticky = page.locator('[data-testid="trip-sticky-bid"]');
  if (await isLaidOut(sticky)) {
    if (await isInViewport(page, sticky)) {
      log.pass(ACTOR, 'trip-sticky-bid-in-viewport');
    } else {
      log.p1(ACTOR, 'trip-sticky-bid-in-viewport', 'sticky bid CTA clipped on mobile');
    }
  } else {
    log.p2(ACTOR, 'trip-sticky-bid-not-rendered', 'owner-side or deal-active');
  }

  if (errors.length) log.p1(ACTOR, 'trip-detail-no-page-errors', `${errors.length}: ${errors[0]}`);
  else log.pass(ACTOR, 'trip-detail-no-page-errors');
});

test('Mobile · Shipper /trip/<id> deep-link survives cold start', async ({ page }) => {
  // Stage 12 reproducer adapted for mobile viewport.
  const errors = [];
  page.on('pageerror', (e) => errors.push((e?.message || String(e)).slice(0, 200)));

  const list = await qaApi.get('/market/trips', { query: { status: 'active', limit: 1 } });
  const id = ((list.json && list.json.trips) || [])[0]?.id;
  if (!id) {
    log.p2(ACTOR, 'no-trip-on-feed', 'feed empty after cleanup');
    return;
  }
  await page.goto(`${BASE_URL}#/trip/${encodeURIComponent(id)}`,
    { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const txt = await bodyText(page);
  if (isCrashPage(txt)) {
    log.p0(ACTOR, 'trip-deeplink-no-crash', 'ErrorBoundary on /trip/<id> deep-link');
  } else {
    log.pass(ACTOR, 'trip-deeplink-no-crash');
  }
  if (errors.length) log.p1(ACTOR, 'trip-deeplink-no-page-errors', errors[0]);
});
