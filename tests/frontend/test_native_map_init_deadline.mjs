import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('src/components/TruckMap.native.js', 'utf8');
const begin = source.indexOf('  React.useEffect(() => {');
const end = source.indexOf('  }, [mapKitInitAttempt]);', begin);
const body = source.slice(begin + '  React.useEffect(() => {'.length, end);
const flush = async () => { await new Promise(r => setImmediate(r)); };
function harness() {
  const states = [], timers = new Map(); let resolve, reject; let seq = 0;
  const promise = new Promise((a,b) => { resolve = a; reject = b; });
  const scope = { MAPKIT_CONFIGURED: true, MAPKIT_AVAILABLE: true, YANDEX_MAPKIT_API_KEY: 'test', mapKitInitPromise: promise,
    setMapKitInitState: s => states.push(s), initializeMapKit: () => promise, console: { warn: () => {} },
    setTimeout: (cb, ms) => { const id = ++seq; timers.set(id, {cb, ms}); return id; }, clearTimeout: id => timers.delete(id) };
  const cleanup = vm.runInNewContext(`(() => {${body}\n})()`, scope);
  return { states, timers, resolve, reject, cleanup, scope };
}
test('зависший MapKit переходит из загрузки в retry/error за ограниченное время', async () => {
  const h = harness(); const timer = [...h.timers.values()][0]; assert.equal(timer.ms, 8000);
  timer.cb(); assert.equal(h.states.at(-1), 'error'); assert.equal(h.scope.mapKitInitPromise, null);
  h.resolve(); await flush(); assert.equal(h.states.at(-1), 'error');
});
test('успешная карта отменяет таймаут', async () => {
  const h = harness(); h.resolve(); await flush(); assert.deepEqual(h.states, ['loading', 'ready']); assert.equal(h.timers.size, 0);
});
test('уход с карты удаляет таймаут и запрещает позднее обновление UI', async () => {
  const h = harness(); h.cleanup(); h.resolve(); await flush(); assert.deepEqual(h.states, ['loading']); assert.equal(h.timers.size, 0);
});
