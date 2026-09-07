import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PENDING_PROVIDER_MAX_AGE_MS,
  isPendingProviderStale,
  shouldRestorePendingProvider,
} from '../../src/utils/socialAuth.js';

const NOW = 1_000_000;

test('fresh Google OAuth remains busy while the active attempt is within TTL', () => {
  const state = { provider: 'google', startedAt: NOW - 1_000 };
  assert.equal(isPendingProviderStale(state, NOW), false);
  assert.equal(shouldRestorePendingProvider(state, { now: NOW }), true);
});

test('expired Google OAuth is cleared when no callback is present', () => {
  const state = { provider: 'google', startedAt: NOW - PENDING_PROVIDER_MAX_AGE_MS - 1 };
  assert.equal(isPendingProviderStale(state, NOW), true);
  assert.equal(shouldRestorePendingProvider(state, { now: NOW }), false);
});

test('legacy Apple string is treated as stale but remains backward-compatible', () => {
  const state = { provider: 'apple', startedAt: null, legacy: true };
  assert.equal(isPendingProviderStale(state, NOW), true);
  assert.equal(shouldRestorePendingProvider(state, { now: NOW }), false);
});

test('a valid callback keeps even stale pending metadata available for completion', () => {
  const state = { provider: 'google', startedAt: NOW - PENDING_PROVIDER_MAX_AGE_MS - 1 };
  assert.equal(shouldRestorePendingProvider(state, { hasCallback: true, now: NOW }), true);
});

test('cleared/remounted state does not resurrect a stale provider', () => {
  assert.equal(shouldRestorePendingProvider(null, { now: NOW }), false);
  assert.equal(shouldRestorePendingProvider(undefined, { now: NOW }), false);
});
