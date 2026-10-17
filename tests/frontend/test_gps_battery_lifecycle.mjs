import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = process.env.GPS_TEST_SOURCE_ROOT || '.';
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
function hookHarness(initial = 'active', foregroundOnly = false) {
  const values = [], effects = [], intervals = new Map(), listeners = new Set();
  const calls = { sample: 0, post: 0, refresh: 0, start: 0, stop: 0 };
  let cursor = 0, effectCursor = 0, nextId = 1;
  const app = { currentState: initial, addEventListener: (_, cb) => {
    listeners.add(cb); return { remove: () => listeners.delete(cb) };
  } };
  const native = {
    Accuracy: { Balanced: 1 }, getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getCurrentPositionAsync: async () => {
      calls.sample++; if (native.wait) await native.wait;
      return { coords: { latitude: 43, longitude: 76 }, timestamp: Date.now() };
    },
  };
  const scope = { FOREGROUND_LOCATION_ONLY: foregroundOnly, AbortController, getCurrentLocationPayload: async () => { const p = await native.getCurrentPositionAsync(); return { lat: p.coords.latitude, lng: p.coords.longitude, timestamp: p.timestamp }; }, Platform: { OS: 'ios' }, AppState: app,
    useRef: v => { const n = cursor++; return values[n] ??= { current: v }; },
    useState: v => { const n = cursor++; if (!(n in values)) values[n] = v;
      return [values[n], x => { values[n] = x; }]; },
    useEffect: (cb, deps) => {
      const n = effectCursor++, prior = effects[n];
      if (prior && deps.every((d, i) => Object.is(d, prior.deps[i]))) return;
      prior?.cleanup?.(); effects[n] = { deps, cb };
    },
    storage: { get: async () => 'session' },
    marketAPI: { activeTrackingDeals: async () => { calls.refresh++; return { ok: true, deal_ids: ['deal'] }; } },
    setActiveDealIds: async () => {}, startBackgroundTracking: async () => { calls.start++; },
    stopBackgroundTracking: async () => { calls.stop++; },
    pushLocationToDeals: async () => { calls.post++; }, LocationModule: native,
    setInterval: cb => { const id = nextId++; intervals.set(id, cb); return id; },
    clearInterval: id => intervals.delete(id), console,
  };
  const source = readFileSync(`${root}/src/hooks/useDealLocationBroadcast.js`, 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export default .*;/g, '').replace(/export /g, '')
    .replace("await import('expo-location')", 'LocationModule');
  vm.runInNewContext(source + '\nglobalThis.hook = useDealLocationBroadcast;', scope);
  function render() {
    cursor = 0; effectCursor = 0; scope.hook(['deal']);
    for (const e of effects) if (e.cb) { const cb = e.cb; e.cb = null; e.cleanup = cb(); }
  }
  return { calls, native, app, intervals, render,
    change: state => { app.currentState = state; for (const cb of [...listeners]) cb(state); render(); },
  };
}

test('фон останавливает UI GPS/polling, но не системное отслеживание активного рейса', async () => {
  const h = hookHarness(); h.render(); await flush(); h.render(); await flush();
  assert.ok(h.calls.sample > 0); assert.ok(h.calls.start > 0);
  const queued = [...h.intervals.values()];
  h.change('background'); await flush();
  const counts = { ...h.calls };
  for (const cb of queued) cb();
  for (const cb of h.intervals.values()) cb();
  await flush();
  assert.deepEqual(h.calls, counts);
  assert.equal(h.calls.stop, 0);
  h.change('active'); await flush(); h.render(); await flush();
  assert.ok(h.calls.refresh > counts.refresh); assert.ok(h.calls.sample > counts.sample);
});

test('UI GPS single-flight: медленное измерение не создаёт параллельные запросы', async () => {
  const h = hookHarness(); h.render(); await flush();
  let resolve; h.native.wait = new Promise(r => { resolve = r; });
  h.render(); await flush();
  const count = h.calls.sample;
  for (const cb of h.intervals.values()) { cb(); cb(); }
  await flush(); assert.equal(h.calls.sample, count);
  h.change('background'); resolve(); await flush();
  assert.equal(h.calls.post, 0);
});

function taskHarness(reply) {
  const data = new Map([['ur_reg_token', 'A'], ['ur_session', '{"user":{"id":"driver"}}'], ['ur_bg_deal_ids', '["deal"]']]);
  const calls = { stop: 0, post: 0 }; let task;
  const native = { hasStartedLocationUpdatesAsync: async () => true,
    stopLocationUpdatesAsync: async () => { calls.stop++; } };
  const storage = { get: async k => data.get(k) ?? null, set: async (k, v) => { data.set(k, v); }, remove: async k => data.delete(k) };
  const scope = { Platform: { OS: 'ios' }, storage, durableStorage: storage,
    createLocationQueue: () => ({ migrate: async () => {}, append: async () => {}, drain: async () => { calls.post++; } }),
    locationSampleId: () => 'sample', API_BASE: 'https://test.invalid', t: k => k,
    AbortController, setTimeout, clearTimeout, console,
    require: name => name === 'expo-task-manager' ? { defineTask: (_, cb) => { task = cb; } } : native,
    fetch: async () => reply(data),
  };
  const source = readFileSync(`${root}/src/utils/backgroundLocation.js`, 'utf8').replace('const FOREGROUND_LOCATION_ONLY = true;', 'const FOREGROUND_LOCATION_ONLY = false;')
    .replace(/^import .*;\s*$/gm, '').replace(/^export .* from .*;\s*$/gm, '').replace(/^export /gm, '');
  vm.runInNewContext(source + '\nglobalThis.lock = runTrackingLifecycle;', scope);
  return { task, data, calls, native, lock: scope.lock };
}
const locationEvent = () => ({ data: { locations: [{ coords: { latitude: 43, longitude: 76 }, timestamp: Date.now() }] } });

test('headless: подтверждённое завершение останавливает native GPS без открытия UI', async () => {
  const h = taskHarness(async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: [] }) }));
  await h.task(locationEvent()); assert.equal(h.calls.stop, 1); assert.equal(h.calls.post, 0);
});

test('headless: offline, malformed и активный рейс не выключают GPS', async () => {
  for (const reply of [async () => { throw Error('offline'); }, async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: ['deal'] }) })]) {
    const h = taskHarness(reply); await h.task(locationEvent()); assert.equal(h.calls.stop, 0);
  }
});

test('headless: ответ старой сессии не выключает трекер нового аккаунта', async () => {
  const h = taskHarness(async data => { data.set('ur_reg_token', 'B');
    return { ok: true, json: async () => ({ ok: true, deal_ids: [] }) }; });
  await h.task(locationEvent()); assert.equal(h.calls.stop, 0);
});


test('headless: новый активный рейс отменяет ожидающую остановку', async () => {
  const h = taskHarness(async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: [] }) }));
  let release; const held = h.lock(() => new Promise(r => { release = r; }));
  await flush();
  const task = h.task(locationEvent()); await flush();
  h.data.set('ur_bg_deal_ids', '["new-deal"]'); release();
  await held; await task; assert.equal(h.calls.stop, 0);
});

test('headless: неудачная native stop повторяется на следующем callback', async () => {
  const h = taskHarness(async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: [] }) }));
  h.native.stopLocationUpdatesAsync = async () => { h.calls.stop++; if (h.calls.stop === 1) throw Error('native failure'); };
  await h.task(locationEvent()); await h.task(locationEvent());
  assert.equal(h.calls.stop, 2);
});


test('текущий foreground-only: открытие обновляет позицию без запуска фонового сервиса', async () => {
  const h = hookHarness('active', true); h.render(); await flush(); h.render(); await flush();
  assert.ok(h.calls.sample > 0); assert.equal(h.calls.start, 0); assert.ok(h.calls.stop > 0);
  h.change('background'); await flush(); const count = h.calls.sample;
  for (const cb of h.intervals.values()) cb(); await flush(); assert.equal(h.calls.sample, count);
  h.change('active'); await flush(); h.render(); await flush(); assert.ok(h.calls.sample > count); assert.equal(h.calls.start, 0);
});


test('one-shot: полученный fix не повторяется по таймеру или дублирующему active событию', async () => {
  const h = hookHarness('active', true); h.render(); await flush(); h.render(); await flush();
  assert.equal(h.calls.sample, 1);
  const sent = h.calls.post;
  for (let n = 0; n < 6; n++) { for (const cb of h.intervals.values()) cb(); await flush(); h.render(); }
  h.change('active'); await flush(); h.render(); await flush();
  assert.equal(h.calls.sample, 1); assert.equal(h.calls.post, sent);
  h.change('background'); await flush(); h.change('active'); await flush(); h.render(); await flush();
  assert.equal(h.calls.sample, 2);
});
