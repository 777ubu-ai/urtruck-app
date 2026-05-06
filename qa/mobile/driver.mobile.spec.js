// Mobile lane — driver flow. Stage 14.
//
// Layout-sensitive checks that desktop QA misses because at 1440×900
// nothing scrolls or wraps. We verify:
//   * landing → "Я водитель" tile reachable on a Pixel 7 / iPhone 13
//     viewport (no off-screen tile, no truncated CTA);
//   * after the role-pick the Feed tab and the publish-trip button
//     are both inside the viewport;
//   * tapping "Подробнее" on a cargo card opens CargoDetail without
//     the ErrorBoundary banner;
//   * sticky "Предложить цену" CTA on CargoDetail is fully visible
//     (i.e. not clipped by the iOS home indicator or Android
//     gesture bar).

const { test, expect } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { isCrashPage, bodyText, gotoLanding, pickRole, isLaidOut, isInViewport } = require('./_helpers');

const ACTOR = 'agent-mobile-driver';

test('Mobile · Driver landing renders without horizontal clipping', async ({ page }) => {
  await gotoLanding(page);
  // Body should be wider than viewport ⇒ horizontal scroll on mobile.
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const vw = page.viewportSize().width;
  if (scrollWidth > vw + 1) {
    log.p1(ACTOR, 'no-horizontal-scroll', `body ${scrollWidth}px > viewport ${vw}px`);
  } else {
    log.pass(ACTOR, 'no-horizontal-scroll');
  }

  // Stage 18: full-image RoleScreen — prefer testID hotspot.
  const driverBtn = page.getByTestId('role-driver').or(page.getByText(/Я водитель|driver/i)).first();
  if (await isLaidOut(driverBtn) && await isInViewport(page, driverBtn)) {
    log.pass(ACTOR, 'driver-tile-on-screen');
  } else {
    log.p1(ACTOR, 'driver-tile-on-screen', 'driver role tile clipped or off-screen on mobile');
  }
});

test('Mobile · Driver feed → CargoDetail → sticky CTA visible', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push((e?.message || String(e)).slice(0, 200)));

  await gotoLanding(page);
  await pickRole(page, 'driver');

  // Cargo card (data-testid added in FeedScreen Stage 6).
  const card = page.locator('[data-testid="cargo-card"]').first();
  if (!(await isLaidOut(card))) {
    log.p2(ACTOR, 'cargo-card-mounted', 'no cargo card in viewport on this run');
    return;
  }
  log.pass(ACTOR, 'cargo-card-mounted');

  await card.click().catch(() => {});
  await page.waitForTimeout(2000);
  const txt = await bodyText(page);
  if (isCrashPage(txt)) {
    log.p0(ACTOR, 'cargo-detail-no-crash', 'ErrorBoundary visible on mobile cargo-detail');
    return;
  }
  log.pass(ACTOR, 'cargo-detail-no-crash');

  // Sticky CTA: "Предложить цену" should sit above the home indicator.
  const sticky = page.locator('[data-testid="cargo-sticky-bid"]');
  if (await isLaidOut(sticky)) {
    if (await isInViewport(page, sticky)) {
      log.pass(ACTOR, 'cargo-sticky-bid-in-viewport');
    } else {
      log.p1(ACTOR, 'cargo-sticky-bid-in-viewport', 'sticky CTA clipped past viewport on mobile');
    }
  } else {
    // Owner / accepted-deal path renders no sticky bar — that's fine,
    // but we still expect ZERO uncaught exceptions on the screen.
    log.p2(ACTOR, 'cargo-sticky-bid-not-rendered', 'owner-side or deal-active state');
  }

  if (errors.length) log.p1(ACTOR, 'cargo-detail-no-page-errors', `${errors.length}: ${errors[0]}`);
  else log.pass(ACTOR, 'cargo-detail-no-page-errors');
});
