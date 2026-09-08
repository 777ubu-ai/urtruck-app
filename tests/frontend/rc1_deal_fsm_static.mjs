// Track B / B1 migration (2026-09-08): this file used to read
// src/screens/ChatScreen.js, which is dead code — nothing in the app
// imports it (see the dead-code manifest in the Track B report). The FSM
// logic it was checking has since been extracted into a pure, directly
// testable resolver (src/utils/dealActionResolver.js) and is consumed by
// the actually-mounted screen, DealWorkspaceScreenV2.js. These tests now
// exercise the real resolver's return values instead of grepping dead JSX
// source — a strictly stronger check, since it runs the real logic rather
// than pattern-matching text that could pass or fail independently of
// runtime behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAvailableDealActions } from '../../src/utils/dealActionResolver.js';

test('shipper has no action while the trip is in_progress, and cannot skip to delivered', () => {
  const actions = getAvailableDealActions({ role: 'client', status: 'in_progress', isInternational: true, t: null });
  assert.deepEqual(actions, [], 'shipper must not get any action button on an in-progress trip');
});

test('shipper can only confirm receipt once the driver has actually marked delivered', () => {
  const actions = getAvailableDealActions({ role: 'client', status: 'delivered', isInternational: true, t: null });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].key, 'received');
});

test('driver delivery is a separate confirmed step from shipper receipt (no shared/collapsed action key)', () => {
  const driverDelivered = getAvailableDealActions({ role: 'driver', status: 'at_border', isInternational: true, t: null });
  const shipperReceipt = getAvailableDealActions({ role: 'client', status: 'delivered', isInternational: true, t: null });
  assert.equal(driverDelivered[0].key, 'delivered');
  assert.equal(shipperReceipt[0].key, 'received');
  assert.notEqual(driverDelivered[0].key, shipperReceipt[0].key, 'driver and shipper must act through distinct FSM keys, never a shared one');
});

test('driver crosses at_border only on international routes; domestic goes straight in_progress -> delivered', () => {
  const international = getAvailableDealActions({ role: 'driver', status: 'in_progress', isInternational: true, t: null });
  const domestic = getAvailableDealActions({ role: 'driver', status: 'in_progress', isInternational: false, t: null });
  const unknown = getAvailableDealActions({ role: 'driver', status: 'in_progress', isInternational: null, t: null });
  assert.equal(international[0].key, 'at_border');
  assert.equal(domestic[0].key, 'delivered');
  assert.equal(unknown[0].key, 'clarify');
  assert.equal(unknown[0].disabled, true, 'unknown international-ness must block progress rather than guessing a route');
});

test('start trip requests background location permission before flipping status to in_progress', () => {
  // getAvailableDealActions only decides *which* action is offered; the
  // permission gate itself lives in the mounted screen's startTrip(), so
  // this one stays a targeted source check against the live file (no
  // React Native component-test harness exists in this repo yet — see
  // Track B report, B1 remaining-work notes).
  const src = fs.readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
  assert.match(src, /const startTrip = React\.useCallback\(async \(\) => \{/);
  assert.match(src, /const permission = await ensureBackgroundLocationPermission\(\);/);
  assert.match(src, /if \(!permission\.ok\) \{ toast\(t\('track_permission_needed'\), 'error'\); return; \}/);
  assert.match(src, /const result = await changeDealStatus\('in_progress'\);/);
  // Permission must be requested before the status write, not after.
  const permIdx = src.indexOf('await ensureBackgroundLocationPermission()');
  const statusIdx = src.indexOf("changeDealStatus('in_progress')");
  assert.ok(permIdx > -1 && statusIdx > -1 && permIdx < statusIdx, 'permission must be requested before the deal status flips to in_progress');
});
