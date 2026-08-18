import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router = fs.readFileSync('src/screens/QueueScreen.js', 'utf8');
const screen = fs.readFileSync('src/screens/QueueScreenLazyV2.js', 'utf8');

test('border route uses the complete booking calendar screen', () => {
  assert.match(router, /QueueScreenLazyV2/);
});

test('official nearest booking is defensively present in the date carousel', () => {
  assert.match(screen, /export function completeBookingCalendar/);
  assert.match(screen, /live\.nearest_booking && !byDate\.has\(live\.nearest_booking\)/);
  assert.match(screen, /standard_free: live\.nearest_booking_free \?\? null/);
  assert.match(screen, /live\.nearest_premium_booking/);
  assert.match(screen, /premium_free = live\.nearest_premium_free \?\? null/);
  assert.match(screen, /sort\(\(a, b\) => String\(a\.date\)\.localeCompare/);
});

test('booking dates are a fully scrollable horizontal carousel with a real trailing gutter', () => {
  assert.match(screen, /<FlatList[\s\S]*horizontal[\s\S]*testID="border-booking-calendar"/);
  assert.match(screen, /ListFooterComponent=\{<View style=\{\{ width: 30 \}\} \/>\}/);
  assert.match(screen, /nestedScrollEnabled/);
  assert.match(screen, /directionalLockEnabled/);
  assert.match(screen, /removeClippedSubviews=\{false\}/);
  assert.match(screen, /testID="border-booking-date-card"/);
});

test('border data stays lazy and no checkpoint fan-out is introduced', () => {
  assert.match(screen, /fetchJson\(`\$\{BASE\}\/catalog`\)/);
  assert.match(screen, /fetchJson\(`\$\{BASE\}\/live\/\$\{encodeURIComponent\(checkpoint\.id\)\}/);
  assert.doesNotMatch(screen, /Promise\.all\([^)]*visible|visible\.map\([^)]*fetchJson/);
});
