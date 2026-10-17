import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('src/components/TruckMap.native.js', 'utf8');
const initStart = source.indexOf('let mapKitInitPromise = null;');
const initEnd = source.indexOf('\n\nconst asPoint', initStart);
const initSource = source.slice(initStart, initEnd);
const begin = source.indexOf('  React.useEffect(() => {');
const end = source.indexOf('  }, [mapKitInitAttempt]);', begin);
const body = source.slice(begin + '  React.useEffect(() => {'.length, end);
const flush = async () => { await new Promise(r => setImmediate(r)); };
function harness() {
  const states = [], timers = new Map(); let resolve, reject; let seq = 0;
  const promise = new Promise((a,b) => { resolve = a; reject = b; });
  const scope = { MAPKIT_CONFIGURED: true, MAPKIT_AVAILABLE: true, YANDEX_MAPKIT_API_KEY: 'test', mapKitInitPromise: promise, mapKitInitGeneration: 1,
    setMapKitInitState: s => states.push(s), initializeMapKit: () => promise, console: { warn: () => {} },
    setTimeout: (cb, ms) => { const id = ++seq; timers.set(id, {cb, ms}); return id; }, clearTimeout: id => timers.delete(id) };
  const cleanup = vm.runInNewContext(`(() => {${body}\n})()`, scope);
  return { states, timers, resolve, reject, cleanup, scope };
}
function retryRaceHarness() {
  const states = [], timers = new Map(), attempts = [];
  let seq = 0;
  const scope = {
    MAPKIT_CONFIGURED: true,
    MAPKIT_AVAILABLE: true,
    YANDEX_MAPKIT_API_KEY: 'test',
    NativeModules: { yamap: true },
    YaMap: { init: () => new Promise((resolve, reject) => attempts.push({ resolve, reject })) },
    setMapKitInitState: state => states.push(state),
    console: { warn: () => {} },
    setTimeout: (cb, ms) => { const id = ++seq; timers.set(id, { cb, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  vm.runInNewContext(initSource, scope);
  scope.getInit = vm.runInNewContext('initializeMapKit', scope);
  scope.getPromise = vm.runInNewContext('() => mapKitInitPromise', scope);
  const mount = () => vm.runInNewContext(`(() => {${body}\n})()`, scope);
  return { scope, states, timers, attempts, mount };
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
test('поздний отказ старой попытки после Retry не сбрасывает новую инициализацию', async () => {
  const h = retryRaceHarness();
  let cleanup = h.mount();
  await flush();
  assert.equal(h.attempts.length, 1);
  const timeout = [...h.timers.values()][0];
  timeout.cb();
  cleanup();

  cleanup = h.mount();
  await flush();
  assert.equal(h.attempts.length, 2, 'Retry запускает следующую попытку после timeout');
  const newerPromise = h.scope.getPromise();
  h.attempts[0].reject(new Error('late failure from timed-out attempt'));
  await flush();

  assert.equal(h.scope.getPromise(), newerPromise, 'старый отказ не должен очищать новую попытку');
  assert.equal(h.scope.getInit(), newerPromise, 'повторное событие должно присоединиться к текущей попытке');
  await flush();
  assert.equal(h.attempts.length, 2, 'не должно возникать параллельной третьей инициализации');
  cleanup();
});
