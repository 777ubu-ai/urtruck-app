// Track: push-recovery (2026-09-09).
//
// Behavioral (not source-regex) coverage for src/utils/push.js's restored
// native FCM/APNs token registration (historical implementation: commit
// fb5c6415, "fix(push): add native gateway and device registry",
// 31.08.2026 — see the forensic-audit report for how it was ported).
//
// Exercises the REAL push.registerNative()/push.unsubscribe() functions
// against controllable fakes for expo-notifications/expo-device (see
// mocks/native_notifications_shim.mjs — a require() shim, because push.js
// deliberately lazy-`require()`s these native-only packages rather than
// static-importing them) and a captured global fetch — not string matching
// against push.js's source text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installNativeRequireShim } from './mocks/native_notifications_shim.mjs';

async function freshPushModule() {
  // Re-import with a cache-busting query so each test gets independent
  // module-level state (storage mock is shared/global across the process,
  // so tests also call resetStorage() below).
  const mod = await import(`../../src/utils/push.js?t=${Date.now()}-${Math.random()}`);
  return mod.push;
}

function resetStorageMock() {
  // The AsyncStorage mock (mocks/async-storage.mjs) keeps an in-memory Map
  // for the whole process — clear it between tests so device_id/native
  // token caching from one test cannot leak into the next.
  return import('./mocks/async-storage.mjs').then((m) => m.default.__reset());
}

function installFetchMock() {
  const calls = [];
  const responses = new Map(); // url-substring -> () => ({status, json})
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), opts, body });
    for (const [needle, makeResponse] of responses) {
      if (String(url).includes(needle)) {
        const { status = 200, json = {} } = makeResponse(body) || {};
        return { status, ok: status >= 200 && status < 300, json: async () => json };
      }
    }
    return { status: 200, ok: true, json: async () => ({ ok: true }) };
  };
  return {
    calls,
    respond(urlSubstring, fn) { responses.set(urlSubstring, fn); },
    uninstall() { globalThis.fetch = originalFetch; },
  };
}

test('Expo token still registers, and Android native token registers separately as provider=fcm with the same device_id', async () => {
  await resetStorageMock();
  const shim = installNativeRequireShim();
  const fetchMock = installFetchMock();
  fetchMock.respond('/register-native', (body) => ({ status: 200, json: { ok: true, user_id: 'u-1' } }));
  try {
    const { Platform } = await import('react-native');
    Platform.OS = 'android';
    const push = await freshPushModule();

    const result = await push.registerNative();

    assert.equal(result.ok, true);
    assert.equal(result.token, shim.state.expoToken, 'top-level token stays the Expo token (backward compatible)');
    assert.equal(result.native_provider, 'fcm');
    assert.equal(result.native_token, shim.state.nativeDeviceToken);

    const registerCalls = fetchMock.calls.filter((c) => c.url.includes('/register-native'));
    assert.equal(registerCalls.length, 2, 'both Expo and native tokens must be registered');
    const providers = registerCalls.map((c) => c.body.provider).sort();
    assert.deepEqual(providers, ['expo', 'fcm']);

    const deviceIds = new Set(registerCalls.map((c) => c.body.device_id));
    assert.equal(deviceIds.size, 1, 'both registrations must use the SAME device_id');

    const fcmCall = registerCalls.find((c) => c.body.provider === 'fcm');
    assert.equal(fcmCall.body.token, shim.state.nativeDeviceToken);
    assert.equal(fcmCall.body.platform, 'android');
  } finally {
    fetchMock.uninstall();
    shim.uninstall();
  }
});

test('iOS native token registers as provider=apns', async () => {
  await resetStorageMock();
  const shim = installNativeRequireShim();
  shim.state.nativeDeviceTokenType = 'ios';
  const fetchMock = installFetchMock();
  fetchMock.respond('/register-native', () => ({ status: 200, json: { ok: true, user_id: 'u-1' } }));
  try {
    const { Platform } = await import('react-native');
    Platform.OS = 'ios';
    const push = await freshPushModule();

    const result = await push.registerNative();

    assert.equal(result.ok, true);
    assert.equal(result.native_provider, 'apns');
    const registerCalls = fetchMock.calls.filter((c) => c.url.includes('/register-native'));
    const apnsCall = registerCalls.find((c) => c.body.provider === 'apns');
    assert.ok(apnsCall, 'an apns registration call must have been made');
    assert.equal(apnsCall.body.platform, 'ios');
  } finally {
    fetchMock.uninstall();
    shim.uninstall();
    const { Platform } = await import('react-native');
    Platform.OS = 'android'; // restore default for subsequent tests
  }
});

test('native registration failure does not suppress or fail the Expo registration', async () => {
  await resetStorageMock();
  const shim = installNativeRequireShim();
  shim.state.getDevicePushTokenThrows = new Error('no google-services.json wired for this build');
  const fetchMock = installFetchMock();
  fetchMock.respond('/register-native', () => ({ status: 200, json: { ok: true, user_id: 'u-1' } }));
  try {
    const push = await freshPushModule();
    const result = await push.registerNative();

    assert.equal(result.ok, true, 'Expo registration must still succeed');
    assert.equal(result.token, shim.state.expoToken);
    assert.equal(result.native_token, null);
    assert.equal(result.native_provider, null);

    const registerCalls = fetchMock.calls.filter((c) => c.url.includes('/register-native'));
    assert.equal(registerCalls.length, 1, 'only the Expo call should have happened');
    assert.equal(registerCalls[0].body.provider, 'expo');
  } finally {
    fetchMock.uninstall();
    shim.uninstall();
  }
});

test('native registration failing at the backend (e.g. 409 conflict) still does not fail Expo', async () => {
  await resetStorageMock();
  const shim = installNativeRequireShim();
  const fetchMock = installFetchMock();
  fetchMock.respond('/register-native', (body) => {
    if (body.provider === 'fcm') return { status: 409, json: { error: 'TOKEN_OWNERSHIP_CONFLICT' } };
    return { status: 200, json: { ok: true, user_id: 'u-1' } };
  });
  try {
    const push = await freshPushModule();
    const result = await push.registerNative();

    assert.equal(result.ok, true);
    assert.equal(result.native.ok, false);
    assert.equal(result.native.reason, 'token_conflict');
    assert.equal(result.native_token, null, 'a failed native registration must not be reported as the active native token');
  } finally {
    fetchMock.uninstall();
    shim.uninstall();
  }
});

test('duplicate registerNative() calls are idempotent: the same device_id is reused both times', async () => {
  await resetStorageMock();
  const shim = installNativeRequireShim();
  const fetchMock = installFetchMock();
  fetchMock.respond('/register-native', () => ({ status: 200, json: { ok: true, user_id: 'u-1' } }));
  try {
    const push = await freshPushModule();
    await push.registerNative();
    const firstDeviceIds = fetchMock.calls.filter((c) => c.url.includes('/register-native')).map((c) => c.body.device_id);
    await push.registerNative();
    const allDeviceIds = fetchMock.calls.filter((c) => c.url.includes('/register-native')).map((c) => c.body.device_id);

    assert.equal(new Set(allDeviceIds).size, 1, 'device_id must be stable/cached across repeated calls, not regenerated');
    assert.equal(allDeviceIds[0], firstDeviceIds[0]);
  } finally {
    fetchMock.uninstall();
    shim.uninstall();
  }
});

test('unsubscribe() unregisters BOTH the Expo and the native token', async () => {
  await resetStorageMock();
  const shim = installNativeRequireShim();
  const fetchMock = installFetchMock();
  fetchMock.respond('/register-native', () => ({ status: 200, json: { ok: true, user_id: 'u-1' } }));
  try {
    const push = await freshPushModule();
    await push.registerNative();
    const beforeUnregister = fetchMock.calls.length;

    await push.unsubscribe();

    const unregisterCalls = fetchMock.calls
      .slice(beforeUnregister)
      .filter((c) => c.url.includes('/unregister-native'));
    assert.equal(unregisterCalls.length, 2, 'both the Expo token and the native token must each get their own unregister call');
    const unregisteredTokens = unregisterCalls.map((c) => c.body.token).sort();
    assert.deepEqual(unregisteredTokens, [shim.state.expoToken, shim.state.nativeDeviceToken].sort());
  } finally {
    fetchMock.uninstall();
    shim.uninstall();
  }
});
