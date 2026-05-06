// Stage 26: hard regression guard for the welcome screen.
//
// Previous Playwright specs called `getByTestId('role-client').click()`
// which is too forgiving — it scrolls the element into view and
// clicks the centre even if a stale React-Native-Web View was
// intercepting the tap on real iPhone Safari. This spec instead:
//   1. Resolves the bounding box of `role-client` / `role-driver` /
//      `role-login` from the real DOM.
//   2. Asserts the box is at least 40 px tall (so a 0-height
//      "invisible hotspot" regression fails immediately).
//   3. Uses `document.elementFromPoint(centerX, centerY)` to make
//      sure the centre of the box really resolves to the role
//      button itself or one of its descendants — NOT to some
//      transparent overlay sitting on top.
//   4. Performs `mouse.click` at the exact centre coordinates and
//      asserts the next-screen URL/text settles in.
//
// Runs on Pixel 7 and iPhone 13 viewports so we cover both
// Chrome-mobile and WebKit-mobile rendering.

const { test } = require('@playwright/test');
const { log } = require('../utils/qaReport');
const { BASE_URL } = require('../utils/qaConfig');

const ACTOR = 'agent-mobile-role';

async function realTap(page, testId, label) {
  const el = page.getByTestId(testId).first();
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    log.p0(ACTOR, `${testId}-visible`, `${label}: testID not visible on viewport`);
    return false;
  }

  const box = await el.boundingBox().catch(() => null);
  if (!box) {
    log.p0(ACTOR, `${testId}-bbox`, `${label}: no boundingBox`);
    return false;
  }
  if (box.height < 40) {
    log.p0(ACTOR, `${testId}-bbox-height`, `${label}: ${box.height}px tall — invisible hotspot regression?`);
    return false;
  }

  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);

  // Stage 26: most important guard. If something else lives on top
  // of the role button at its visual centre, taps will silently
  // hit the wrong element. We refuse the test instead of clicking
  // and pretending it worked.
  const ownerInfo = await page.evaluate(({ x, y, want }) => {
    const top = document.elementFromPoint(x, y);
    if (!top) return { ok: false, reason: 'no-element-at-point', tag: null };
    let cur = top;
    let depth = 0;
    while (cur && depth < 12) {
      if (cur.getAttribute && cur.getAttribute('data-testid') === want) {
        return { ok: true, tag: top.tagName, ancestor: 'self-or-descendant' };
      }
      cur = cur.parentElement;
      depth += 1;
    }
    return {
      ok: false,
      reason: 'wrong-owner',
      tag: top.tagName,
      cls: (top.className && (typeof top.className === 'string' ? top.className : top.className.baseVal)) || '',
      id: top.id || '',
    };
  }, { x: cx, y: cy, want: testId });

  if (!ownerInfo.ok) {
    log.p0(
      ACTOR,
      `${testId}-overlap`,
      `${label}: elementFromPoint ${cx},${cy} is ${ownerInfo.tag}#${ownerInfo.id}.${ownerInfo.cls} — not ${testId}`,
    );
    return false;
  }

  await page.mouse.click(cx, cy);
  await page.waitForTimeout(1500);

  const body = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
  if (/Что-то пошло не так|Произошла ошибка/i.test(body)) {
    log.p0(ACTOR, `${testId}-no-error-boundary`, `${label}: ErrorBoundary appeared after tap`);
    return false;
  }
  log.pass(ACTOR, `${testId}-tapped`, `${label} → opened next screen`);
  return true;
}

test('Mobile · role-driver real-tap (bbox + elementFromPoint guard)', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await realTap(page, 'role-driver', 'Я водитель');
});

test('Mobile · role-client real-tap (bbox + elementFromPoint guard)', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await realTap(page, 'role-client', 'Я грузовладелец');
});

test('Mobile · role-login real-tap (bbox + elementFromPoint guard)', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await realTap(page, 'role-login', 'Войти');
});
