import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/screens/DealsScreen.js', import.meta.url), 'utf8');

test('DealsScreen filters stale open bids client-side as a safety net', () => {
  assert.match(source, /isBidFresh\(bid\)/);
});

test('DealsScreen shows a remaining-time countdown for active bids', () => {
  assert.match(source, /formatBidRemaining\(data, lang\)/);
});

test('expired bids are labelled as expired instead of cancelled', () => {
  assert.match(source, /data\.status === 'expired'/);
  assert.match(source, /t\('status_expired'\)/);
});
