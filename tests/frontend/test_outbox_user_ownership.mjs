// Блок 2/8 аудита (P1-5): src/utils/outbox.js — очередь неотправленных
// сообщений чата не должна отправляться под ЧУЖОЙ активной сессией.
// Регресс: раньше flushOutbox() отправляло ВСЮ очередь при факте hasToken,
// без проверки владельца — сообщения пользователя A теоретически могли
// уйти под токеном пользователя B при быстрой смене аккаунта на одном
// устройстве.
//
// Запуск (из корня репозитория):
//   node --experimental-loader ./tests/frontend/loader.mjs tests/frontend/test_outbox_user_ownership.mjs
import assert from 'node:assert/strict';
import AsyncStorageMock from './mocks/async-storage.mjs';
import {
  enqueueOutbox, flushOutbox, outboxCount, clearOutbox, clearOutboxForUser,
} from '../../src/utils/outbox.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  AsyncStorageMock.__reset();
  try {
    await fn();
    passed++; console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++; console.log(`  ❌ ${name}: ${e.message}`);
  }
}

await test('flush отправляет только записи активного пользователя', async () => {
  await enqueueOutbox({ clientId: 'c1', payload: { text: 'from A' } }, 'user-A');
  await enqueueOutbox({ clientId: 'c2', payload: { text: 'from B' } }, 'user-B');
  const sentPayloads = [];
  const sent = await flushOutbox(async (p) => { sentPayloads.push(p); }, 'user-A');
  assert.equal(sent, 1, 'должно уйти ровно 1 сообщение (только user-A)');
  assert.deepEqual(sentPayloads, [{ text: 'from A' }]);
  assert.equal(await outboxCount(), 1, 'запись user-B должна остаться в карантине');
});

await test('чужая запись не удаляется и не отправляется при любом числе flush-вызовов', async () => {
  await enqueueOutbox({ clientId: 'c1', payload: { text: 'from B only' } }, 'user-B');
  for (let i = 0; i < 3; i++) {
    const sent = await flushOutbox(async () => { throw new Error('НЕ должно вызываться для чужой записи'); }, 'user-A');
    assert.equal(sent, 0);
  }
  assert.equal(await outboxCount(), 1);
});

await test('legacy-запись без userId отправляется текущим активным (backward-compat)', async () => {
  await enqueueOutbox({ clientId: 'c-legacy', payload: { text: 'legacy' } }); // без userId
  const sent = await flushOutbox(async () => {}, 'user-A');
  assert.equal(sent, 1, 'запись без userId (до фикса) не должна зависать навсегда');
});

await test('clearOutbox() при logout вычищает всё, включая чужие карантинные записи', async () => {
  await enqueueOutbox({ clientId: 'c1', payload: {} }, 'user-A');
  await enqueueOutbox({ clientId: 'c2', payload: {} }, 'user-B');
  await clearOutbox();
  assert.equal(await outboxCount(), 0);
});

await test('clearOutboxForUser() удаляет только записи указанного владельца', async () => {
  await enqueueOutbox({ clientId: 'c1', payload: {} }, 'user-A');
  await enqueueOutbox({ clientId: 'c2', payload: {} }, 'user-B');
  await clearOutboxForUser('user-A');
  assert.equal(await outboxCount(), 1);
});

await test('сетевая ошибка останавливает flush, но не трогает уже успешно отправленные', async () => {
  await enqueueOutbox({ clientId: 'c1', payload: { n: 1 } }, 'user-A');
  await enqueueOutbox({ clientId: 'c2', payload: { n: 2 } }, 'user-A');
  let calls = 0;
  const sent = await flushOutbox(async () => {
    calls++;
    if (calls === 2) throw new Error('network down');
  }, 'user-A');
  assert.equal(sent, 1);
  assert.equal(await outboxCount(), 1, 'второе сообщение остаётся в очереди на следующий flush');
});

console.log(`\n${failed === 0 ? 'ВСЕ ЗЕЛЁНЫЕ' : failed + ' FAIL'} (passed=${passed}, failed=${failed})`);
process.exit(failed === 0 ? 0 : 1);
