import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/TruckMap.native.js', 'utf8');
const initialization = source.split('let mapKitInitPromise = null;')[1].split('\nconst asPoint =')[0];
function harness(init, configured = true) {
  return new Function('YaMap', 'MAPKIT_CONFIGURED', 'YANDEX_MAPKIT_API_KEY',
    `let mapKitInitPromise = null; ${initialization}; return initializeMapKit;`)(
    { init }, configured, 'mock-key',
  );
}

test('без native module/key инициализация SDK не вызывается', async () => {
  const initialize = harness(() => assert.fail('SDK не должен запускаться'), false);
  assert.equal(await initialize(), false);
});

test('параллельные mounts используют один SDK initialization', async () => {
  let calls = 0, resolve;
  const pending = new Promise((done) => { resolve = done; });
  const initialize = harness(() => { calls++; return pending; });
  const first = initialize();
  const second = initialize();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve(true);
  await Promise.all([first, second]);
  await initialize();
  assert.equal(calls, 1);
});

for (const synchronous of [false, true]) {
  test(`после ${synchronous ? 'синхронной' : 'асинхронной'} ошибки SDK retry делает новую попытку`, async () => {
    let calls = 0;
    const initialize = harness(() => {
      calls++;
      if (calls === 1) {
        if (synchronous) throw new Error('transient SDK error');
        return Promise.reject(new Error('transient SDK error'));
      }
      return Promise.resolve(true);
    });
    await assert.rejects(initialize(), /transient SDK error/);
    assert.equal(await initialize(), true);
    assert.equal(calls, 2);
    await initialize();
    assert.equal(calls, 2);
  });
}

test('инициализация retry доступна только для runtime error и имеет localized label', () => {
  assert.match(source, /mapKitInitState === 'error'[\s\S]*testID="truck-map-native-init-retry"/);
  assert.match(source, /setMapKitInitAttempt\(\(value\) => value \+ 1\)/);
  assert.match(source, /\}, \[mapKitInitAttempt\]\)/);
  assert.match(source, /t\('chat_attach_retry'\)/);
});
