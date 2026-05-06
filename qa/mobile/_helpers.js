// Stage 14: shared helpers for mobile lane specs. Keeps role-pick,
// crash-detection and viewport metrics out of every individual spec.

const { BASE_URL } = require('../utils/qaConfig');

const CRASH_MARKERS = ['Что-то пошло не так', 'Something went wrong', 'Application Error'];
const isCrashPage = (txt) => CRASH_MARKERS.some((s) => txt && txt.includes(s));

async function bodyText(page) {
  try { return await page.locator('body').innerText({ timeout: 4000 }); }
  catch { return ''; }
}

async function gotoLanding(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function pickRole(page, role /* 'driver' | 'shipper' */) {
  // Stage 18: RoleScreen is a full-image hero — the button labels
  // live inside the bitmap and are not searchable as DOM text any
  // more. Hotspots remain TouchableOpacity with stable testIDs
  // (`role-driver` / `role-client`), so we look those up first and
  // only fall back to the legacy text matcher for older builds /
  // unrelated landings.
  const testId = role === 'driver' ? 'role-driver' : 'role-client';
  const byId = page.getByTestId(testId).first();
  if (await byId.count().catch(() => 0)) {
    const visible = await byId.isVisible().catch(() => false);
    const box = visible ? await byId.boundingBox().catch(() => null) : null;
    if (box && box.width > 0 && box.height > 0) {
      await byId.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      return true;
    }
  }
  const re = role === 'driver'
    ? /Я водитель|driver/i
    : /Я грузовладелец|I'm a shipper|cargo owner|client/i;
  const btn = page.getByText(re).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

// Visibility check that ignores native-element hit-testing (the web
// bundle wraps TouchableOpacity in nested divs that confuse default
// `isVisible`). We require the element to have non-zero size and
// actually exist in the layout tree — that's what the eye sees.
async function isLaidOut(locator) {
  try {
    if (await locator.count() === 0) return false;
    const box = await locator.first().boundingBox().catch(() => null);
    if (!box) return false;
    return box.width > 0 && box.height > 0;
  } catch { return false; }
}

// Returns true when an element is fully inside the viewport (no
// vertical clipping past the visible window). On mobile this is the
// kind of check that catches "submit button hidden behind keyboard"
// or "sticky CTA falls under home indicator".
async function isInViewport(page, locator) {
  try {
    const box = await locator.first().boundingBox().catch(() => null);
    if (!box) return false;
    const vp = page.viewportSize() || { width: 0, height: 0 };
    return box.y >= 0 && box.y + box.height <= vp.height;
  } catch { return false; }
}

module.exports = {
  isCrashPage,
  bodyText,
  gotoLanding,
  pickRole,
  isLaidOut,
  isInViewport,
};
