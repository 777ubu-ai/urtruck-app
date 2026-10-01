import test from 'node:test';
import assert from 'node:assert/strict';

const pendingKey = 'ur_pending_logout_token';

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
