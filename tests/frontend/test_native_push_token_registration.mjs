import test from 'node:test';
import assert from 'node:assert/strict';
import { installNativeRequireShim } from './mocks/native_notifications_shim.mjs';

async function freshPush() {
  return (await import(`../../src/utils/push.js?t=${Date.now()}-${Math.random()}`)).push;
}
async function reset() { return (await import('./mocks/async-storage.mjs')).default.__reset(); }
function fetchMock() {
  const calls = []; const old = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    calls.push({url: String(url), body});
    return {status: 200, ok: true, json: async () => ({ok: true, user_id: 'u-1'})};
  };
  return {calls, restore: () => { globalThis.fetch = old; }};
}

test('Android registers only native FCM token', async () => {
  await reset(); const shim = installNativeRequireShim(); const f = fetchMock();
  try {
    const { Platform } = await import('react-native'); Platform.OS = 'android';
    const result = await (await freshPush()).registerNative();
    assert.equal(result.ok, true); assert.equal(result.native_provider, 'fcm');
    const calls = f.calls.filter((x) => x.url.includes('/register-native'));
    assert.equal(calls.length, 1); assert.equal(calls[0].body.provider, 'fcm');
    assert.equal(calls[0].body.token, shim.state.nativeDeviceToken);
  } finally { f.restore(); shim.uninstall(); }
});
test('iOS registers only native APNs token', async () => {
  await reset(); const shim = installNativeRequireShim(); shim.state.nativeDeviceTokenType = 'ios'; const f = fetchMock();
  try {
    const { Platform } = await import('react-native'); Platform.OS = 'ios';
    const result = await (await freshPush()).registerNative();
    assert.equal(result.native_provider, 'apns');
    const calls = f.calls.filter((x) => x.url.includes('/register-native'));
    assert.equal(calls.length, 1); assert.equal(calls[0].body.provider, 'apns');
  } finally { f.restore(); shim.uninstall(); const { Platform } = await import('react-native'); Platform.OS = 'android'; }
});

test('missing native token does not register an Expo token', async () => {
  await reset(); const shim = installNativeRequireShim(); shim.state.getDevicePushTokenThrows = new Error('not configured'); const f = fetchMock();
  try {
    const result = await (await freshPush()).registerNative();
    assert.equal(result.ok, false); assert.equal(f.calls.filter((x) => x.url.includes('/register-native')).length, 0);
  } finally { f.restore(); shim.uninstall(); }
});

test('repeated registration keeps one provider and stable device id', async () => {
  await reset(); const shim = installNativeRequireShim(); const f = fetchMock();
  try {
    const push = await freshPush(); await push.registerNative(); await push.registerNative();
    const calls = f.calls.filter((x) => x.url.includes('/register-native'));
    assert.ok(calls.length >= 1); assert.equal(new Set(calls.map((x) => x.body.device_id)).size, 1);
    assert.ok(calls.every((x) => ['fcm', 'apns'].includes(x.body.provider)));
  } finally { f.restore(); shim.uninstall(); }
});

test('concurrent native registration is coalesced into one network write', async () => {
  await reset(); const shim = installNativeRequireShim(); const old = globalThis.fetch;
  const calls = [];
  let release;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body) });
    await new Promise((resolve) => { release = resolve; });
    return { status: 200, ok: true, json: async () => ({ ok: true, user_id: 'u-1' }) };
  };
  try {
    const push = await freshPush();
    const pending = Promise.all(Array.from({ length: 25 }, () => push.registerNative()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls.filter((x) => x.url.includes('/register-native')).length, 1);
    release();
    assert.ok((await pending).every((result) => result.ok));
  } finally { globalThis.fetch = old; shim.uninstall(); }
});

test('native token rotation re-registers the current installation once', async () => {
  await reset(); const shim = installNativeRequireShim(); const f = fetchMock();
  try {
    const push = await freshPush();
    await push.registerNative();
    assert.equal(shim.state.tokenListeners.length, 1);
    shim.state.nativeDeviceToken = 'rotated-native-device-token-abc123';
    await shim.NotificationsMock.__emitTokenRotation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const calls = f.calls.filter((x) => x.url.includes('/register-native'));
    assert.equal(calls.length, 2);
    assert.equal(calls.at(-1).body.token, 'rotated-native-device-token-abc123');
    assert.equal(calls[0].body.device_id, calls[1].body.device_id);
  } finally { f.restore(); shim.uninstall(); }
});
