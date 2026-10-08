import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pendingKey = 'ur_pending_logout_token';

test('ensureGuest can return a token without persisting before auth-owner validation', async () => {
  const store = await reset();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'guest-response-token', verification_level: 0 }) });
  try {
    const api = await freshRegistration();
    const result = await api.ensureGuest({ persist: false });
    assert.equal(result.token, 'guest-response-token');
    assert.equal(await store.getItem('ur_reg_token'), null);
    assert.equal(await store.getItem('ur_verification_level'), null);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

async function reset() {
  const store = (await import('./mocks/async-storage.mjs')).default;
  await store.__reset();
  return store;
}

async function freshRegistration() {
  return (await import(`../../src/utils/registration.js?t=${Date.now()}-${Math.random()}`)).regAPI;
}

test('503 logout is persisted and retried successfully after restart', async () => {
  const store = await reset();
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 503, json: async () => ({ detail: 'LOGOUT_RETRY_REQUIRED' }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, revoked: true }) };
  };
  try {
    const api = await freshRegistration();
    const failed = await api.logout('old-session-token');
    assert.equal(failed.ok, false);
    assert.equal(failed.status, 503);
    assert.deepEqual(JSON.parse(await store.getItem(pendingKey)), ['old-session-token']);

    const retried = await api.flushPendingLogout();
    assert.equal(retried.ok, true);
    assert.equal(calls, 2);
    assert.equal(await store.getItem(pendingKey), null);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('network failure keeps exactly the old bearer queued', async () => {
  const store = await reset();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const api = await freshRegistration();
    assert.equal((await api.logout('session-to-revoke')).ok, false);
    assert.deepEqual(JSON.parse(await store.getItem(pendingKey)), ['session-to-revoke']);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('protected-storage write failure aborts logout staging instead of silently losing the bearer', async () => {
  const store = await reset();
  const originalSet = store.setItem;
  try {
    await originalSet('ur_reg_token', 'opaque-test-bearer');
    store.setItem = async (key, value) => {
      if (key === pendingKey) throw new Error('secure storage unavailable');
      return originalSet(key, value);
    };
    const api = await freshRegistration();

    await assert.rejects(
      api.stageLogoutRevoke(await api.getToken()),
      (error) => error?.code === 'PENDING_LOGOUT_REVOKE_NOT_DURABLE',
    );
    // AuthContext must see this failure and keep the bearer rather than
    // clearing the session into an unrecoverable logout state.
    assert.equal(await api.getToken(), 'opaque-test-bearer');
    assert.equal(await store.getItem(pendingKey), null);
  } finally {
    store.setItem = originalSet;
  }
});

test('AuthContext does not clear the bearer when durable revoke staging is unverified', () => {
  const source = readFileSync('src/utils/AuthContext.js', 'utf8');
  const stage = source.indexOf('await regAPI.stageLogoutRevoke(authToken)');
  const abort = source.indexOf("reason: 'PENDING_LOGOUT_REVOKE_NOT_DURABLE'");
  const clear = source.indexOf('await regAPI.clearToken()');
  assert.ok(stage >= 0 && abort > stage && clear > abort,
    'logout must return before clearToken when durable staging is unavailable');
});

test('logout revoke is durable before the live token can be removed by a crash', async () => {
  const store = await reset();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, revoked: true }) });
  try {
    const api = await freshRegistration();
    await store.setItem('ur_reg_token', 'bearer-before-crash');

    // This models the precise AuthContext crash window: the user has pressed
    // logout, but the process dies immediately after the live bearer is gone.
    await api.stageLogoutRevoke('bearer-before-crash');
    await store.removeItem('ur_reg_token');

    assert.deepEqual(JSON.parse(await store.getItem(pendingKey)), ['bearer-before-crash']);
    assert.equal((await api.flushPendingLogout()).ok, true);
    assert.equal(await store.getItem(pendingKey), null);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('every post-stage logout interruption keeps the revoke durable until restart confirms it', async (t) => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, revoked: true }) });
  try {
    for (const checkpoint of [
      'after-stage',
      'after-auth-state-reset',
      'after-live-bearer-removal',
      'after-push-cleanup',
      'after-local-cache-cleanup',
    ]) {
      await t.test(checkpoint, async () => {
        const store = await reset();
        const api = await freshRegistration();
        await store.setItem('ur_reg_token', 'durable-revoke-test-bearer');

        // AuthContext stages before every subsequent local cleanup action.
        // A process death at any one of these checkpoints therefore leaves
        // the next launch enough information to make the server revoke.
        await api.stageLogoutRevoke(await api.getToken());
        if (checkpoint !== 'after-stage' && checkpoint !== 'after-auth-state-reset') {
          await api.clearToken();
        }

        assert.deepEqual(JSON.parse(await store.getItem(pendingKey)), ['durable-revoke-test-bearer']);
        const restarted = await freshRegistration();
        assert.equal((await restarted.flushPendingLogout()).ok, true);
        assert.equal(await store.getItem(pendingKey), null);
      });
    }
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('failed logouts from different accounts are both retained and flushed', async () => {
  const store = await reset();
  const oldFetch = globalThis.fetch;
  const seen = [];
  let offline = true;
  globalThis.fetch = async (_url, options) => {
    const token = options.headers.Authorization.replace('Bearer ', '');
    seen.push(token);
    if (offline) throw new Error('offline');
    return { ok: true, status: 200, json: async () => ({ ok: true, revoked: true }) };
  };
  try {
    const api = await freshRegistration();
    await api.logout('account-a-token');
    await api.logout('account-b-token');
    assert.deepEqual(JSON.parse(await store.getItem(pendingKey)), ['account-a-token', 'account-b-token']);

    offline = false;
    const result = await api.flushPendingLogout();
    assert.equal(result.ok, true);
    assert.deepEqual(seen, ['account-a-token', 'account-b-token', 'account-a-token', 'account-b-token']);
    assert.equal(await store.getItem(pendingKey), null);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
