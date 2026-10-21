import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionRole } from '../../src/utils/externalFreightSession.js';

test('feed role comes from the authenticated user and normalizes shipper', () => {
  assert.equal(sessionRole({ user: { role: 'driver' } }), 'driver');
  assert.equal(sessionRole({ user: { role: 'shipper' } }), 'client');
  assert.equal(sessionRole({ user: { role: 'unknown' } }, 'driver'), null);
});

test('route role is only a guest fallback', () => {
  assert.equal(sessionRole(null, 'client'), 'client');
  assert.equal(sessionRole(null, 'admin'), null);
});
