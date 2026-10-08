import test from 'node:test';
import assert from 'node:assert/strict';
import { Platform } from 'react-native';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function loadBadgeWith(setBadgeCountAsync) {
  const previous = globalThis.require;
  globalThis.require = (specifier) => {
    if (specifier === 'expo-notifications') return { setBadgeCountAsync };
    if (typeof previous === 'function') return previous(specifier);
    throw new Error(`unexpected module ${specifier}`);
  };
  const module = await import(`../../src/utils/appBadge.js?case=${Date.now()}-${Math.random()}`);
  return { module, restore: () => { globalThis.require = previous; } };
}

test('Xiaomi ShortcutBadgeException preserves the canonical non-zero value', async () => {
  const { module, restore } = await loadBadgeWith(async () => {
    const error = new Error('Unable to execute badge');
    error.name = 'ShortcutBadgeException';
    throw error;
  });
  try {
    const result = await module.setAppIconBadge(3);
    assert.deepEqual(result, {
      badge: 3,
      applied: false,
      reason: 'launcher_badge_unsupported',
    });
  } finally {
    restore();
  }
});

test('a launcher false result is not reported as a successful reset', async () => {
  const { module, restore } = await loadBadgeWith(async () => false);
  try {
    assert.deepEqual(await module.setAppIconBadge(7), {
      badge: 7,
      applied: false,
      reason: 'launcher_badge_unsupported',
    });
  } finally {
    restore();
  }
});

test('web still reads and returns the canonical server badge', async () => {
  const previousOs = Platform.OS;
  const previousFetch = globalThis.fetch;
  const store = (await import('./mocks/async-storage.mjs')).default;
  store.__reset();
  await store.setItem('ur_reg_token', 'session-web');
  Platform.OS = 'web';
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ badge: 4 }) });
  try {
    const { module, restore } = await loadBadgeWith(async () => true);
    try {
      assert.deepEqual(await module.refreshAppIconBadge(), {
        badge: 4,
        applied: false,
        reason: 'platform_unsupported',
      });
    } finally { restore(); }
  } finally {
    Platform.OS = previousOs;
    globalThis.fetch = previousFetch;
  }
});

test('two concurrent refreshes finish with the newest successful canonical value', async () => {
  const previousFetch = globalThis.fetch;
  const store = (await import('./mocks/async-storage.mjs')).default;
  store.__reset();
  await store.setItem('ur_reg_token', 'session-native');
  const first = deferred();
  const second = deferred();
  let requests = 0;
  globalThis.fetch = () => (++requests === 1 ? first.promise : second.promise);
  const applied = [];
  const { module, restore } = await loadBadgeWith(async (value) => { applied.push(value); return true; });
  try {
    const p1 = module.refreshAppIconBadge();
    const p2 = module.refreshAppIconBadge();
    second.resolve({ ok: true, status: 200, json: async () => ({ badge: 2 }) });
    await tick();
    first.resolve({ ok: true, status: 200, json: async () => ({ badge: 1 }) });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.reason, 'superseded');
    assert.equal(r2.badge, 2);
    assert.deepEqual(applied, [2]);
  } finally {
    restore();
    globalThis.fetch = previousFetch;
  }
});

test('network failure preserves the prior badge instead of applying zero', async () => {
  const previousFetch = globalThis.fetch;
  const store = (await import('./mocks/async-storage.mjs')).default;
  store.__reset();
  await store.setItem('ur_reg_token', 'session-native');
  globalThis.fetch = async () => { throw new Error('offline'); };
  const applied = [];
  const { module, restore } = await loadBadgeWith(async (value) => { applied.push(value); return true; });
  try {
    const result = await module.refreshAppIconBadge();
    assert.deepEqual(result, { badge: null, applied: false, reason: 'canonical_unavailable' });
    assert.deepEqual(applied, []);
  } finally {
    restore();
    globalThis.fetch = previousFetch;
  }
});
