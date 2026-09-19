import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cargo = readFileSync('src/screens/CargoDetail.js', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');

test('cargo detail names listing price explicitly in all supported locales', () => {
  assert.match(cargo, /acceptedBid \? t\('deal_price'\) : t\('cargo_price_label'\)/);
  for (const label of ['Цена груза', 'Жүк бағасы', '货物价格', 'Cargo price']) {
    assert.ok(i18n.includes(`cargo_price_label: '${label}'`), `missing translation: ${label}`);
  }
});

test('server-truth my_bid replaces stale active copies from the same bidder', () => {
  assert.match(cargo, /if \(d\.my_bid\)[\s\S]*rawBids = rawBids\.filter/);
  assert.match(cargo, /b\.bidder_id === d\.my_bid\.bidder_id[\s\S]*b\.status === 'pending'[\s\S]*b\.status === 'countered'/);
  assert.match(cargo, /rawBids\.push\(d\.my_bid\)/);
});

test('owner/public view dedupes legacy active prices for every bidder', () => {
  assert.match(cargo, /activeWinnerByBidder = new Map\(\)/);
  assert.match(cargo, /activeStatuses = new Set\(\['pending', 'countered', 'accepted'\]\)/);
  assert.match(cargo, /activeWinnerByBidder\.get\(bid\.bidder_id\)\?\.id === bid\.id/);
});

test('driver sees own active offer only in the My bid action card', () => {
  assert.match(cargo, /if \(b\.isMine && \(b\.status === 'pending' \|\| b\.status === 'countered'\)[\s\S]*return false/);
  assert.match(cargo, /testID="cargo-my-active-bid"/);
  assert.match(cargo, /formatPrice\(myPendingBid\.amount, c\.currency\)/);
});
