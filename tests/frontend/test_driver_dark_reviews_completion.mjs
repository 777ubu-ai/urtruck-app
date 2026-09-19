import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const design = fs.readFileSync('src/theme/designV1.js', 'utf8');
const palette = fs.readFileSync('src/theme/designV1Palette.js', 'utf8');
const deal = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const reviews = fs.readFileSync('src/utils/reviews.js', 'utf8');

test('driver Ceramic palette follows the global dark-mode selection', () => {
  assert.match(palette, /export const DRIVER_CERAMIC_DARK = \{/);
  assert.match(design, /return isDark \? DRIVER_CERAMIC_DARK : DRIVER_CERAMIC;/);
});

test('completed deal exposes the two-sided review prompt with deal id', () => {
  assert.match(deal, /deal\?\.status !== 'completed'/);
  assert.match(deal, /reviewsAPI\.eligibility\(recipientId, dealId\)/);
  assert.match(deal, /testID="deal-review-prompt"/);
  assert.match(deal, /tripId=\{dealId\}/);
  assert.match(deal, /targetRole=\{isDriver \? 'client' : 'driver'\}/);
});

test('review network requests fail visibly instead of spinning forever', () => {
  assert.match(reviews, /new AbortController\(\)/);
  assert.match(reviews, /setTimeout\(\(\) => controller\.abort\(\), 12000\)/);
  assert.match(reviews, /if \(!response\.ok\)/);
});
