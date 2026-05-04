// QA preview gate regression — DesignPreview must be reachable only via
// the two-factor URL gate (?qa=design&key=<internal>) on web. Casual
// visitors who only see ?qa=design must NOT get the gallery, and native
// builds must never expose it (qaDesignMode early-returns on
// Platform.OS !== 'web', so a Playwright web run is the only meaningful
// regression check here).
//
// The key lives in the bundle by design (it's an obscurity gate, not
// authn). To avoid hard-coding it in test source we read QA_PREVIEW_KEY
// from env first; fallback matches the value in
// src/screens/DesignPreviewScreen.js and is also already public in the
// shipped JS bundle. Do NOT inline the key into README/docs.

const { test } = require('@playwright/test');
const { BASE_URL } = require('../utils/qaConfig');
const { log } = require('../utils/qaReport');

const ACTOR = 'agent-preview-gate';
const PREVIEW_KEY = process.env.QA_PREVIEW_KEY || 'urtruck_preview_2026';

const PREVIEW_MARKERS = [
  /Visual Preview/i,
  /QA · DESIGN/i,
];

async function isPreviewVisible(page) {
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (PREVIEW_MARKERS.some((re) => re.test(body))) return true;
  const tagged = await page.locator('[data-testid^="qa-preview-"]').count().catch(() => 0);
  return tagged > 0;
}

test.describe.configure({ mode: 'serial' });

test('Preview gate · without key', async ({ page }) => {
  const url = `${BASE_URL}?qa=design&_v=${Date.now()}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  const visible = await isPreviewVisible(page);
  if (visible) {
    log.p0(ACTOR, 'no-key-hides-preview', `?qa=design (no key) leaked DesignPreview at ${url}`);
  } else {
    log.pass(ACTOR, 'no-key-hides-preview');
  }
});

test('Preview gate · with valid key', async ({ page }) => {
  const url = `${BASE_URL}?qa=design&key=${encodeURIComponent(PREVIEW_KEY)}&_v=${Date.now()}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  const visible = await isPreviewVisible(page);
  if (visible) {
    log.pass(ACTOR, 'valid-key-shows-preview');
  } else {
    log.p0(ACTOR, 'valid-key-shows-preview', 'preview did not render with valid key');
  }
});
