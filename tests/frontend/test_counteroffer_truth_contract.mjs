import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cargo = readFileSync('src/screens/CargoDetail.js', 'utf8');
const backend = readFileSync('backend/api/marketplace.py', 'utf8');

test('driver counter CTA displays the active counter amount, not original bid', () => {
  assert.match(cargo, /testID="bid-accept-counter"[\s\S]*formatPrice\(b\.counterAmount/);
  assert.match(cargo, /testID="cargo-counter-accept"[\s\S]*formatPrice\(myPendingBid\.counterAmount/);
});

test('shipper countered state never offers an accept-original-amount CTA', () => {
  const ownerStart = cargo.indexOf('{!readOnly && c.isMine && isCountered && (');
  const driverStart = cargo.indexOf('{!readOnly && b.isMine && !c.isMine && isCountered && (', ownerStart);
  assert.ok(ownerStart > -1 && driverStart > ownerStart);
  const ownerBlock = cargo.slice(ownerStart, driverStart);
  assert.doesNotMatch(ownerBlock, /bid-accept|acceptBid\(|cancelOwnCounter\(|formatPrice\(b\.amount/);
  assert.match(ownerBlock, /bid-reject/);
});

test('backend accepts counter using counter_amount as the single deal amount', () => {
  const start = backend.indexOf('def accept_counter(');
  const end = backend.indexOf('def cancel_counter_as_owner(', start);
  const block = backend.slice(start, end);
  assert.match(block, /counter = bid\.get\("counter_amount"\)/);
  assert.match(block, /_finalize_accept_inline\(c, owner_user, bid, counter, expected_status="countered"\)/);
  assert.match(block, /"amount": counter/);
});
