import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const onboarding = readFileSync('src/screens/onboarding/OnboardingV2Screen.js', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');

function jpegDimensions(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes[0], 0xff, `${path} is not a JPEG`);
  assert.equal(bytes[1], 0xd8, `${path} is not a JPEG`);

  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error(`JPEG dimensions not found: ${path}`);
}

test('final onboarding uses the three approved vertical assets', () => {
  const assets = [
    'assets/onboarding/slide-1-hero.jpg',
    'assets/onboarding/slide-2-driver-1.jpg',
    'assets/onboarding/slide-2-driver-2.jpg',
  ];
  for (const path of assets) assert.deepEqual(jpegDimensions(path), { width: 864, height: 1536 });
  assert.match(onboarding, /const ONBOARDING_IMAGE_ASPECT = 864 \/ 1536/);
  assert.match(onboarding, /testID="onb-v2-brand-logo"/);
  assert.match(onboarding, /color: brand\.logoDark/);
  assert.match(onboarding, /color: brand\.logoAccent/);
  assert.match(onboarding, /resizeMode/);
  assert.equal((onboarding.match(/testID="onb-v2-brand-logo"/g) || []).length, 1, 'onboarding must render one brand logo');
  assert.match(onboarding, /const WINDOW_S[123] = \{ from: 0, to: 0\.42 \}/);
  assert.match(onboarding, /testID="onb-v2-cta-phone"/);
  assert.match(onboarding, /testID="onb-v2-cta-guest"/);
});

test('onboarding copy stays localized in all four supported languages', () => {
  for (const key of ['onb_v2_slide1_title', 'onb_v2_slide1_subtitle', 'onb_v2_slide2_title', 'onb_v2_slide2_subtitle', 'onb_v2_slide3_title', 'onb_v2_slide3_subtitle']) {
    assert.equal((i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 4, `${key} must exist in RU/KK/ZH/EN`);
  }
});
