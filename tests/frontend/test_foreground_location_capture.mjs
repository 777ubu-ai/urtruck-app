import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('src/utils/foregroundLocation.js', 'utf8');
const { captureForegroundPosition: capture } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const tick = () => new Promise(r => setImmediate(r));
function setup() {
  const listeners = new Set(); let cb, removed = 0, watched = 0;
  const appState = { currentState: 'active', addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const location = { Accuracy: { Balanced: 1 }, watchPositionAsync: async (_, fn) => { watched++; cb = fn; return { remove: () => { removed++; } }; } };
  return { location, appState, point: (timestamp = Date.now()) => cb?.({ coords: { latitude: 43, longitude: 76 }, timestamp }),
    background: () => { appState.currentState = 'background'; for (const fn of [...listeners]) fn('background'); },
    removed: () => removed, watched: () => watched, listeners: () => listeners.size };
}
test('свежее измерение завершает и удаляет нативную подписку', async () => {
  const h = setup(); const promise = capture(h.location, { appState: h.appState }); await tick(); h.point();
  assert.equal((await promise).coords.latitude, 43); assert.equal(h.removed(), 1); assert.equal(h.listeners(), 0);
});
test('старое измерение не выдаётся за текущую позицию', async () => {
  const h = setup(); const promise = capture(h.location, { appState: h.appState, timeoutMs: 10 });
  h.point(Date.now() - 60000); assert.equal(await promise, null); assert.equal(h.removed(), 1);
});
test('нет GPS: конечный таймаут отменяет нативную подписку', async () => {
  const h = setup(); assert.equal(await capture(h.location, { appState: h.appState, timeoutMs: 5 }), null); assert.equal(h.removed(), 1);
});
test('блокировка/сворачивание отменяет текущее измерение и слушателя', async () => {
  const h = setup(); const p = capture(h.location, { appState: h.appState }); await tick(); h.background();
  assert.equal(await p, null); assert.equal(h.removed(), 1); assert.equal(h.listeners(), 0); h.point();
});
test('подписка, разрешившаяся после отмены, немедленно удаляется', async () => {
  const h = setup(); let finish; h.location.watchPositionAsync = () => new Promise(r => { finish = r; });
  const controller = new AbortController(); const p = capture(h.location, { appState: h.appState, signal: controller.signal });
  controller.abort(); assert.equal(await p, null); let removed = 0; finish({ remove: () => { removed++; } }); await tick(); assert.equal(removed, 1);
});
test('измерение не стартует в фоне или после abort', async () => {
  const h = setup(); h.background(); assert.equal(await capture(h.location, { appState: h.appState }), null); assert.equal(h.watched(), 0);
});

function policyHarness(paused = false) {
  const data = new Map([['ur_reg_token', 'A'], ['ur_session', '{"user":{"id":"driver"}}'], ['ur_bg_deal_ids', '["deal"]']]);
  const calls = { start: 0, stop: 0, fetch: 0, bgPermission: 0, append: 0 }; let task;
  const appState = { currentState: 'active' };
  const storage = { get: async k => data.get(k) ?? null, set: async (k,v) => data.set(k,v), remove: async k => data.delete(k) };
  const native = { Accuracy: { Balanced: 1 }, hasStartedLocationUpdatesAsync: async () => true,
    stopLocationUpdatesAsync: async () => { calls.stop++; }, startLocationUpdatesAsync: async () => { calls.start++; },
    getForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
    getBackgroundPermissionsAsync: async () => { calls.bgPermission++; return { status: 'denied' }; },
  };
  const scope = { GPS_TRACKING_PAUSED: paused, Platform: { OS: 'ios' }, AppState: appState, captureForegroundPosition: capture, storage, durableStorage: storage,
    createLocationQueue: () => ({ migrate: async () => {}, append: async () => { calls.append++; }, drain: async () => {} }),
    locationSampleId: () => 'sample', API_BASE: 'https://test.invalid', t: k => k, AbortController, setTimeout, clearTimeout, console,
    require: name => name === 'expo-task-manager' ? { defineTask: (_, cb) => { task = cb; } } : native,
    fetch: async () => { calls.fetch++; return { ok: true, json: async () => ({ ok: true, deal_ids: ['deal'] }) }; },
  };
  const code = fs.readFileSync('src/utils/backgroundLocation.js', 'utf8')
    .replace(/^import .*;\s*$/gm, '').replace(/^export .* from .*;\s*$/gm, '').replace(/^export /gm, '');
  const api = vm.runInNewContext(code + '\n({getCurrentLocationPayload,getLocationHealth,requestForegroundLocationPermission,FOREGROUND_LOCATION_ONLY,startBackgroundTracking,getBackgroundLocationPermissionState,restoreBackgroundTrackingForLogoutFailure,pushLocationToDeals})', scope);
  return { api, task, calls, appState, data };
}
test('текущий режим по умолчанию не запускает native background и убирает старую регистрацию', async () => {
  const h = policyHarness(); assert.equal(h.api.FOREGROUND_LOCATION_ONLY, true);
  await h.api.startBackgroundTracking(); await h.api.restoreBackgroundTrackingForLogoutFailure('A', true);
  assert.equal(h.calls.start, 0); assert.equal(h.calls.stop, 1);
});
test('foreground-разрешения достаточно: Always даже не проверяется', async () => {
  const h = policyHarness(); const p = await h.api.getBackgroundLocationPermissionState();
  assert.equal(p.ok, true); assert.equal(p.foregroundOnly, true); assert.equal(h.calls.bgPermission, 0);
});
test('headless callback только останавливает legacy GPS: ни измерений, ни сети, ни записи точек', async () => {
  const h = policyHarness(); await h.task({ data: { locations: [{ coords: { latitude: 43, longitude: 76 }, timestamp: Date.now() }] } });
  assert.equal(h.calls.stop, 1); assert.equal(h.calls.fetch, 0); assert.equal(h.calls.append, 0);
  assert.equal(h.data.get('ur_bg_deal_ids'), '["deal"]');
});
test('поздняя foreground-отправка не стартует в фоне', async () => {
  const h = policyHarness(); h.appState.currentState = 'background';
  await h.api.pushLocationToDeals({ lat: 43, lng: 76, timestamp: Date.now() }, ['deal']);
  assert.equal(h.calls.fetch, 0); assert.equal(h.calls.append, 0);
});

test('ошибка native remove не оставляет ожидающий запрос и слушатель AppState', async () => {
  const h = setup();
  h.location.watchPositionAsync = async (_, cb) => { setImmediate(() => cb({ coords: { latitude: 43, longitude: 76 }, timestamp: Date.now() })); return { remove: () => { throw Error('native cleanup failed'); } }; };
  assert.equal((await capture(h.location, { appState: h.appState })).coords.latitude, 43);
  assert.equal(h.listeners(), 0);
});

test('пауза до native API: нет разрешений, измерений, очереди или сети; старый сервис остановлен', async () => {
 const h = policyHarness(true);
 assert.equal(await h.api.getCurrentLocationPayload(),null);
 assert.equal((await h.api.getLocationHealth()).state,'paused');
 assert.equal((await h.api.requestForegroundLocationPermission()).reason,'gps_paused');
 assert.equal((await h.api.pushLocationToDeals({lat:43,lng:76,timestamp:Date.now()},['deal'])).reason,'gps_paused');
 await h.api.startBackgroundTracking();
 assert.equal(h.calls.start,0); assert.equal(h.calls.fetch,0); assert.equal(h.calls.append,0); assert.equal(h.calls.bgPermission,0); assert.ok(h.calls.stop>0);
});
