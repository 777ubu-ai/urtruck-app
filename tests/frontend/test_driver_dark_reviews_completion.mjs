import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const design = fs.readFileSync('src/theme/designV1.js', 'utf8');
const palette = fs.readFileSync('src/theme/designV1Palette.js', 'utf8');
const deal = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const cargoDetail = fs.readFileSync('src/screens/CargoDetail.js', 'utf8');
const tripDetail = fs.readFileSync('src/screens/TripDetail.js', 'utf8');
const reviews = fs.readFileSync('src/utils/reviews.js', 'utf8');

test('driver Ceramic palette follows the global dark-mode selection', () => {
  assert.match(palette, /export const DRIVER_CERAMIC_DARK = \{/);
  assert.match(design, /return isDark \? DRIVER_CERAMIC_DARK : DRIVER_CERAMIC;/);
});

test('shipper Ceramic palette follows the global dark-mode selection', () => {
  assert.match(palette, /export const SHIPPER_CERAMIC_DARK = \{/);
  assert.match(design, /return isDark \? SHIPPER_CERAMIC_DARK : SHIPPER_CERAMIC;/);
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

test('counterparty timeline refreshes with the authoritative deal poll', () => {
  const polling = deal.slice(
    deal.indexOf('React.useEffect(() => {\n    refreshDeal();\n    refreshTimeline();'),
    deal.indexOf('// Documents render as ordinary bubbles'),
  );
  assert.match(polling, /setInterval\(\(\) => \{/);
  assert.match(polling, /refreshDeal\(\);[\s\S]*refreshTimeline\(\);/);
  assert.match(polling, /15000/);
  assert.match(deal, /const openStatusModal[\s\S]*refreshDeal\(\);[\s\S]*refreshTimeline\(\);/);
  assert.match(deal, /testID="deal-status-open"[\s\S]*onPress=\{openStatusModal\}|onPress=\{openStatusModal\}[\s\S]*testID="deal-status-open"/);
});

test('detail review forms reconcile already-submitted state with the server', () => {
  for (const source of [cargoDetail, tripDetail]) {
    assert.match(source, /reviewsAPI\.eligibility\(reviewTargetId, reviewReferenceId\)/);
    assert.match(source, /setReviewSent\(Boolean\(result\?\.already_reviewed\)\)/);
    assert.match(source, /reviewChecked && !reviewSent && reviewTargetId/);
    assert.match(source, /error\?\.status === 409[\s\S]*setReviewSent\(true\)/);
  }
});
