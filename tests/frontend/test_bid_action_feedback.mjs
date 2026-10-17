import test from 'node:test';
import assert from 'node:assert/strict';
import { bidActionFailureMessage } from '../../src/utils/bidActionFeedback.js';

const t = (key) => ({ session_expired: 'localized-session', bid_not_pending: 'localized-changed', accept_failed: 'localized-accept' }[key]);

test('expired session and already-processed bid return localized UI feedback', () => {
  assert.equal(bidActionFailureMessage({ status: 401, detail: 'Russian backend detail' }, 'accept_failed', t), 'localized-session');
  assert.equal(bidActionFailureMessage({ status: 409, detail: 'Russian backend detail' }, 'accept_failed', t), 'localized-changed');
});

test('unknown response keeps a safe backend message or localized fallback', () => {
  assert.equal(bidActionFailureMessage({ status: 503 }, 'accept_failed', t), 'localized-accept');
  assert.equal(bidActionFailureMessage({ status: 403, detail: 'not allowed' }, 'accept_failed', t), 'not allowed');
});
