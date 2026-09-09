// Track: push-recovery (2026-09-09).
//
// src/utils/push.js lazily does `require('expo-notifications')` /
// `require('expo-device')` INSIDE registerNative() (not a static top-level
// import) — a deliberate pattern (see push.js comments) so importing push.js
// on web/plain-Node never throws even though those native-only packages are
// not installed in this checkout at all (confirmed: not in node_modules —
// this is intentional, they only ever ship inside the native app bundle via
// Expo/Metro, not this repo's own package.json).
//
// loader.mjs's resolve-hook only intercepts ESM `import`, not CJS
// `require()`, and under Node's ESM module evaluation a bare `require`
// identifier isn't even defined (confirmed empirically — ReferenceError).
// So exercising registerNative()'s REAL logic (not just its "package not
// installed" early-return) needs a require() shim, scoped to this file only
// via `installNativeRequireShim()` — no project source is modified, and no
// other test file's module resolution is affected.
export function installNativeRequireShim() {
  const state = {
    permissionStatus: 'undetermined', // 'granted' | 'denied' | 'undetermined'
    isDevice: true,
    expoToken: 'ExponentPushToken[test-expo-token]',
    expoTokenThrows: null, // Error | null
    nativeDeviceToken: 'fake-native-device-token-abc123', // FCM registration token / APNs device token shape is provider-specific but opaque to push.js
    nativeDeviceTokenType: 'android', // mirrors expo-notifications' DevicePushToken.type ('android'|'ios')
    getDevicePushTokenThrows: null, // Error | null — e.g. no google-services.json wired
    channelCreateCalls: [],
    permissionRequestCalls: 0,
  };

  const AndroidImportance = { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 };

  const NotificationsMock = {
    setNotificationHandler() {},
    async getPermissionsAsync() {
      return { status: state.permissionStatus };
    },
    async requestPermissionsAsync() {
      state.permissionRequestCalls += 1;
      if (state.permissionStatus === 'undetermined') state.permissionStatus = 'granted';
      return { status: state.permissionStatus };
    },
    async setNotificationChannelAsync(id, config) {
      state.channelCreateCalls.push({ id, config });
    },
    AndroidImportance,
    async getExpoPushTokenAsync() {
      if (state.expoTokenThrows) throw state.expoTokenThrows;
      return { data: state.expoToken };
    },
    async getDevicePushTokenAsync() {
      if (state.getDevicePushTokenThrows) throw state.getDevicePushTokenThrows;
      return { data: state.nativeDeviceToken, type: state.nativeDeviceTokenType };
    },
  };

  const DeviceMock = {
    get isDevice() { return state.isDevice; },
    modelName: 'QA Test Device',
    deviceName: 'QA Test Device',
    osVersion: '15',
  };

  const fakeModules = {
    'expo-notifications': NotificationsMock,
    'expo-device': DeviceMock,
  };

  const previous = globalThis.require;
  globalThis.require = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(fakeModules, specifier)) return fakeModules[specifier];
    if (typeof previous === 'function') return previous(specifier);
    throw new Error(`native_notifications_shim: unmocked require('${specifier}')`);
  };

  return {
    state,
    NotificationsMock,
    DeviceMock,
    uninstall() { globalThis.require = previous; },
  };
}
