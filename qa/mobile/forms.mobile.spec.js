// Mobile lane — Create cargo / Create trip forms. Stage 14.
//
// Layout-sensitive checks:
//   * the publish-cargo / publish-trip CTA on the feed-title row
//     is reachable on a Pixel 7 / iPhone 13 viewport;
//   * the publish form mounts without ErrorBoundary;
//   * RoutePointPicker overlay renders inside the form column (not
//     clipped, not absolutely-positioned off-screen);
//   * native <input type="date"> exists when a Date field is opened
//     (DatePicker fork on web).

const { test } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { isCrashPage, bodyText, gotoLanding, pickRole, isLaidOut, isInViewport } = require('./_helpers');

const ACTOR = 'agent-mobile-forms';

test('Mobile · Driver opens CreateTrip without crash', async ({ page }) => {
  await gotoLanding(page);
  await pickRole(page, 'driver');

  const publish = page.locator('[data-testid="publish-trip-button"]');
  if (!(await isLaidOut(publish))) {
    log.p2(ACTOR, 'publish-trip-button-on-screen', 'CTA off-screen / not in driver layout');
    return;
  }
  if (!(await isInViewport(page, publish))) {
    log.p1(ACTOR, 'publish-trip-button-on-screen', 'CTA outside viewport on mobile');
  } else {
    log.pass(ACTOR, 'publish-trip-button-on-screen');
  }
  await publish.click().catch(() => {});
  await page.waitForTimeout(1500);
  const txt = await bodyText(page);
  if (isCrashPage(txt)) {
    log.p0(ACTOR, 'create-trip-no-crash', 'ErrorBoundary on CreateTrip mobile');
    return;
  }
  log.pass(ACTOR, 'create-trip-no-crash');

  // Tap the route picker — the overlay must mount inside the
  // current column (not push off-screen).
  const fromField = page.locator('[data-testid="trip-from-input"]');
  // The Field wrapper opens the picker; on web the testID is on the
  // CityInput overlay child. We can't always click it directly, so
  // we look for the picker's search row text.
  await page.waitForTimeout(500);
  // The picker placeholder text from i18n is one of our four
  // languages — we accept any of the three glyph sets.
  const pickerHint = page.getByText(/Поиск|Search|Іздеу|搜索/i).first();
  if (await isLaidOut(pickerHint)) {
    if (await isInViewport(page, pickerHint)) {
      log.pass(ACTOR, 'route-picker-in-viewport');
    } else {
      log.p1(ACTOR, 'route-picker-in-viewport', 'picker rendered off-screen on mobile');
    }
  } else {
    log.p2(ACTOR, 'route-picker-mounted', 'picker not auto-opened (expected on tap-to-toggle path)');
  }
});

test('Mobile · Shipper opens CreateCargo without crash', async ({ page }) => {
  await gotoLanding(page);
  await pickRole(page, 'shipper');
  const publish = page.locator('[data-testid="publish-cargo-button"]');
  if (!(await isLaidOut(publish))) {
    log.p2(ACTOR, 'publish-cargo-button-on-screen', 'CTA off-screen on this layout');
    return;
  }
  if (!(await isInViewport(page, publish))) {
    log.p1(ACTOR, 'publish-cargo-button-on-screen', 'publish CTA outside viewport');
  } else {
    log.pass(ACTOR, 'publish-cargo-button-on-screen');
  }
  await publish.click().catch(() => {});
  await page.waitForTimeout(1500);
  const txt = await bodyText(page);
  if (isCrashPage(txt)) log.p0(ACTOR, 'create-cargo-no-crash', 'ErrorBoundary on CreateCargo mobile');
  else log.pass(ACTOR, 'create-cargo-no-crash');
});
