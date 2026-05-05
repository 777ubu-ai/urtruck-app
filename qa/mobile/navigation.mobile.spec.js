// Mobile lane — bottom nav + filter chips + safe area. Stage 14.
//
// Layout-sensitive checks:
//   * the bottom-nav component is mounted and its plus button is
//     visible on a Pixel 7 / iPhone 13 viewport;
//   * navigation cells share the same baseline (Stage 6 alignment
//     fix — we keep the `Δy ≤ 6 px` contract on mobile);
//   * the four filter chips (Direction / Date / Body / Price) on
//     the public feed all sit inside the viewport (this catches
//     the "fourth chip overflows the right edge" mobile bug);
//   * tapping the Date chip surfaces a real `<input type="date">`
//     element so mobile users get the native calendar.

const { test } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { gotoLanding, pickRole, isLaidOut, isInViewport } = require('./_helpers');

const ACTOR = 'agent-mobile-nav';

test('Mobile · bottom-nav + plus button reachable for guest', async ({ page }) => {
  await gotoLanding(page);
  // Public feed is reachable as guest after role pick.
  await pickRole(page, 'driver');

  const nav = page.locator('[data-testid="bottom-nav"]');
  if (!(await isLaidOut(nav))) {
    log.p2(ACTOR, 'bottom-nav-mounted', 'guest may not see MainTabs without auth');
    return;
  }
  log.pass(ACTOR, 'bottom-nav-mounted');

  const plus = page.locator('[data-testid="bottom-nav-publish"]');
  if (await isLaidOut(plus) && await isInViewport(page, plus)) {
    log.pass(ACTOR, 'plus-button-in-viewport');
  } else {
    log.p1(ACTOR, 'plus-button-in-viewport', 'central + button clipped on mobile viewport');
  }

  const feed = page.locator('[data-testid="bottom-nav-feed"]');
  const profile = page.locator('[data-testid="bottom-nav-profile"]');
  if (await isLaidOut(feed) && await isLaidOut(profile)) {
    const a = await feed.boundingBox();
    const b = await profile.boundingBox();
    if (a && b && Math.abs(a.y - b.y) <= 6) {
      log.pass(ACTOR, 'cells-aligned-on-mobile', `Δy=${Math.abs(a.y - b.y).toFixed(1)}px`);
    } else {
      log.p1(ACTOR, 'cells-aligned-on-mobile', `Δy=${a && b ? Math.abs(a.y - b.y).toFixed(1) : '?'}px`);
    }
  } else {
    log.p2(ACTOR, 'cells-aligned-on-mobile', 'cells not in viewport');
  }
});

test('Mobile · all four filter chips fit on the feed strip', async ({ page }) => {
  await gotoLanding(page);
  await pickRole(page, 'driver');
  await page.waitForTimeout(800);

  const vw = page.viewportSize().width;
  const chips = [
    /🧭|Направление|Direction/i,
    /📅|Дата|Date/i,
    /🚛|Кузов|Body/i,
    /💰|Цена|Price/i,
  ];
  let visibleCount = 0;
  let clippedCount = 0;
  for (const re of chips) {
    const chip = page.getByText(re).first();
    if (!(await isLaidOut(chip))) continue;
    const box = await chip.boundingBox();
    if (!box) continue;
    visibleCount += 1;
    if (box.x + box.width > vw + 1) clippedCount += 1;
  }
  if (visibleCount === 0) {
    log.p2(ACTOR, 'filter-chips-on-strip', 'no chip visible on this layout');
  } else if (clippedCount === 0) {
    log.pass(ACTOR, 'filter-chips-on-strip', `${visibleCount}/4 in row, none clipped`);
  } else {
    log.p1(ACTOR, 'filter-chips-on-strip', `${clippedCount}/${visibleCount} chips clip past right edge — strip should scroll horizontally`);
  }
});

test('Mobile · Date chip surfaces a native calendar input', async ({ page }) => {
  await gotoLanding(page);
  await pickRole(page, 'driver');

  const dateChip = page.getByText(/📅|Дата|Date/i).first();
  if (!(await isLaidOut(dateChip))) {
    log.p2(ACTOR, 'date-chip-found', 'Date chip not on this layout');
    return;
  }
  await dateChip.click().catch(() => {});
  await page.waitForTimeout(700);

  const dateInput = page.locator('input[type="date"]');
  const cnt = await dateInput.count().catch(() => 0);
  if (cnt >= 1) {
    log.pass(ACTOR, 'date-chip-opens-real-calendar', `${cnt} <input type=date> elements`);
  } else {
    log.p1(ACTOR, 'date-chip-opens-real-calendar', 'no native date input on mobile — chip falls back to TextInput');
  }
});
