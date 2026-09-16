import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/screens/CargoDetail.js', 'utf8');

test('driver bid CTA exists only for an active cargo listing', () => {
  assert.match(src, /!c\.isMine && !listingUnavailable && c\.status === 'active' && !dealStatus && !myPendingBid/);
  assert.match(src, /testID: 'cargo-sticky-bid'/);
});

test('taken cargo cannot visually invite a rejected losing driver to bid again', () => {
  const sticky = src.slice(src.indexOf('Sticky CTA'), src.indexOf('<BidModal'));
  assert.match(sticky, /!listingUnavailable/);
  assert.match(sticky, /c\.status === 'active'/);
  assert.doesNotMatch(sticky, /c\.status !== 'cancelled'/);
});
