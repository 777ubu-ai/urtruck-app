import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/navigation/AppNavigator.js', 'utf8');
const effect = source.slice(source.indexOf('  // A driver updating mid-trip'),
  source.indexOf('  // Канон таб-баров'));
const flush = async () => { for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve)); };

function harness(role = 'driver', supported = true, holdRead = null) {
  let callback, listener, token = 'driver-A';
  const calls = [];
  const app = { currentState: 'active', addEventListener: (_, cb) => {
    listener = cb; return { remove: () => { listener = null; } };
  } };
  const scope = {
    FOREGROUND_LOCATION_ONLY: true, session: { user: { id: 'driver-A', role } },
    AppState: app,
    storage: { get: async () => token },
    marketAPI: {
      activeTrackingDeals: async () => {
        calls.push('read'); if (holdRead) await holdRead;
        return { snapshot_location_supported: supported, deal_ids: ['owned-deal'] };
      },
      activateSnapshotTracking: async (id) => { calls.push('mode:' + id); return { ok: true }; },
    },
    useEffect: (cb) => { callback = cb; },
  };
  vm.runInNewContext(effect, scope);
  return { calls, start: () => callback(), resume: () => listener?.('active'), rotate: () => { token = 'driver-B'; },
    app };
}

test('вход водителя переводит только его активную сделку в snapshot без GPS', async () => {
  const h = harness(); const stop = h.start(); await flush();
  assert.deepEqual(h.calls, ['read', 'mode:owned-deal']);
  h.app.currentState = 'background'; h.resume(); await flush();
  assert.deepEqual(h.calls, ['read', 'mode:owned-deal']);
  stop();
});

test('грузоотправитель и старый сервер не меняют режим чужой сделки', async () => {
  for (const h of [harness('client'), harness('driver', false)]) {
    h.start(); await flush();
    assert.ok(!h.calls.some(call => call.startsWith('mode:')));
  }
});

test('смена токена во время ответа исключает запись от прежней сессии', async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const h = harness('driver', true, hold); h.start(); await flush();
  h.rotate(); release(); await flush();
  assert.deepEqual(h.calls, ['read']);
});
