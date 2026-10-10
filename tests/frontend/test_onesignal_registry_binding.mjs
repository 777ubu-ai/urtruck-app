import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/utils/oneSignalRegistration.js','utf8').replace(/export /g,'');
function setup(extra, optedIn = true) {
  let sdkCalls = 0;
  const OneSignal = { User: { getOnesignalId: async () => 'user-id', pushSubscription: {
    getIdAsync: async () => 'subscription-id', getTokenAsync: async () => 'native-token', getOptedInAsync: async () => optedIn } } };
  const ctx = { require: name => name === 'expo-constants' ? { default: { expoConfig: { extra } } } : (sdkCalls++, { OneSignal }) };
  vm.runInNewContext(source + '\nglobalThis.read = readOneSignalRegistration;',ctx);
  return { read: ctx.read, calls: () => sdkCalls };
}
const qa2 = { oneSignalPilot: { enabled: true }, urtruckBuildFlavor: 'qa2', urtruckApiUrl: 'https://qa2.urtruck.kz' };
test('production never loads pilot SDK or registers pilot metadata', async () => {
  const h = setup({ ...qa2, urtruckBuildFlavor: 'production' }); assert.equal(await h.read(), null); assert.equal(h.calls(), 0);
});
test('wrong API host cannot enable pilot even with QA2 flag', async () => {
  const h = setup({ ...qa2, urtruckApiUrl: 'https://urtruck.kz' }); assert.equal(await h.read(), null); assert.equal(h.calls(), 0);
});
test('QA2 opted-in subscription carries exact native token and identities', async () => {
  const h = setup(qa2); const result = await h.read();
  assert.equal(result.token, 'native-token'); assert.equal(result.onesignal_subscription_id, 'subscription-id');
  assert.equal(result.onesignal_user_id, 'user-id'); assert.equal(result.app_id, 'com.urtruck.app.qa2');
});
test('opted-out subscription cannot register as delivery target', async () => { assert.equal(await setup(qa2, false).read(), null); });
