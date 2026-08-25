// Behavioral regression (owner review round 2, 25.08.2026): a transient
// backend-verify failure AFTER a successful Supabase PKCE exchange must
// stay retryable — the one-shot code must not be re-exchanged, but the
// backend verify step MUST be retried, and success must still land the
// user authenticated. Run with the RN/AsyncStorage mock loader:
//   node --experimental-loader ./tests/frontend/loader.mjs --test tests/frontend/test_social_auth_retry.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../../src/config/supabase.js';
import {
  completeSocialAuth,
  setPendingProvider,
  clearPendingProvider,
  AUTH_ERROR_CODES,
} from '../../src/utils/socialAuth.js';

const CALLBACK_URL = 'https://urtruck.kz/?social_auth=1&code=test-pkce-code-123';

function withMocks(fn) {
  return async (t) => {
    let exchangeCalls = 0;
    const fakeSession = { access_token: 'fake-supabase-access-token' };

    const originalExchange = supabase.auth.exchangeCodeForSession;
    const originalGetSession = supabase.auth.getSession;
    supabase.auth.exchangeCodeForSession = async () => {
      exchangeCalls += 1;
      return { data: { session: fakeSession }, error: null };
    };
    supabase.auth.getSession = async () => ({ data: { session: fakeSession }, error: null });

    const originalFetch = global.fetch;

    t.after(async () => {
      supabase.auth.exchangeCodeForSession = originalExchange;
      supabase.auth.getSession = originalGetSession;
      global.fetch = originalFetch;
      await clearPendingProvider();
    });

    await clearPendingProvider();
    await setPendingProvider('google');

    await fn(t, { getExchangeCalls: () => exchangeCalls });
  };
}

test(
  'retry after backend-verify 500 reuses the Supabase session instead of re-exchanging the one-shot PKCE code',
  withMocks(async (t, { getExchangeCalls }) => {
    let verifyCalls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('/register/social/verify')) {
        verifyCalls += 1;
        if (verifyCalls === 1) {
          return { ok: false, status: 500, json: async () => ({ detail: 'internal_error' }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            token: 'urtruck-token-xyz',
            email: 'owner@example.com',
            role: 'guest',
            verification_level: 1,
          }),
        };
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    };

    // First attempt: Supabase exchange succeeds, backend verify fails (500).
    await assert.rejects(
      () => completeSocialAuth(CALLBACK_URL),
      (err) => err.code === AUTH_ERROR_CODES.BACKEND_VERIFY_FAILED,
    );
    assert.equal(getExchangeCalls(), 1, 'first attempt must exchange the PKCE code exactly once');
    assert.equal(verifyCalls, 1, 'first attempt must call backend verify exactly once');

    // Retry with the SAME callback URL (e.g. the user reloaded the page —
    // the query string is preserved on failure, only cleared on success).
    // Must NOT re-exchange the one-shot code, must retry backend verify,
    // and must reach an authenticated UrTruck session.
    const result = await completeSocialAuth(CALLBACK_URL);
    assert.equal(getExchangeCalls(), 1, 'retry must reuse the already-exchanged Supabase session, not re-exchange the code');
    assert.equal(verifyCalls, 2, 'retry must actually retry backend verify');
    assert.equal(result.token, 'urtruck-token-xyz', 'retry success must return the UrTruck token');

    // A THIRD delivery of the SAME url (duplicate effect fire arriving
    // after success already landed) must be a pure no-op.
    const dup = await completeSocialAuth(CALLBACK_URL);
    assert.equal(dup, null, 'duplicate delivery after success must no-op, not re-verify');
    assert.equal(verifyCalls, 2, 'no-op must not call backend verify again');
    assert.equal(getExchangeCalls(), 1, 'no-op must not touch Supabase again either');
  }),
);

test(
  'retry after a network failure on backend verify also reuses the session, not the PKCE code',
  withMocks(async (t, { getExchangeCalls }) => {
    // Distinct code from the other tests — completedCallbackKey/
    // exchangedCallbackKey are module-level (mirrors the real single-tab
    // app), so reusing a code already marked complete in another test
    // would false-positive as a duplicate no-op here.
    const url = 'https://urtruck.kz/?social_auth=1&code=network-blip-code-789';
    let verifyCalls = 0;
    global.fetch = async (u) => {
      if (String(u).includes('/register/social/verify')) {
        verifyCalls += 1;
        if (verifyCalls === 1) throw new TypeError('Failed to fetch');
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'urtruck-token-abc', email: 'retry@example.com', role: 'guest', verification_level: 1 }),
        };
      }
      throw new Error(`unexpected fetch in test: ${u}`);
    };

    await assert.rejects(
      () => completeSocialAuth(url),
      (err) => err.code === AUTH_ERROR_CODES.NETWORK_UNAVAILABLE,
    );
    assert.equal(getExchangeCalls(), 1);

    const result = await completeSocialAuth(url);
    assert.equal(getExchangeCalls(), 1, 'network-blip retry must not re-exchange the code');
    assert.equal(verifyCalls, 2);
    assert.equal(result.token, 'urtruck-token-abc');
  }),
);

test(
  'a callback URL never seen before still performs a real Supabase exchange (no false-positive dedup)',
  withMocks(async (t, { getExchangeCalls }) => {
    global.fetch = async (url) => {
      if (String(url).includes('/register/social/verify')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'urtruck-token-fresh', email: 'fresh@example.com', role: 'guest', verification_level: 1 }),
        };
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    };
    const freshUrl = 'https://urtruck.kz/?social_auth=1&code=another-fresh-code-456';
    const result = await completeSocialAuth(freshUrl);
    assert.equal(getExchangeCalls(), 1);
    assert.equal(result.token, 'urtruck-token-fresh');
  }),
);
