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
import { readFile } from 'node:fs/promises';
import AsyncStorageMock from './mocks/async-storage.mjs';
import {
  bindOutboxSession, enqueueOutbox, flushOutbox, outboxCount,
  clearOutbox, clearOutboxForUser, invalidateOutboxSession,
} from '../../src/utils/outbox.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  invalidateOutboxSession();
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
  bindOutboxSession('user-A');
  const sentPayloads = [];
  const sent = await flushOutbox(async (p) => { sentPayloads.push(p); }, 'user-A');
  assert.equal(sent, 1, 'должно уйти ровно 1 сообщение (только user-A)');
  assert.deepEqual(sentPayloads, [{ text: 'from A' }]);
  assert.equal(await outboxCount(), 1, 'запись user-B должна остаться в карантине');
});

await test('чужая запись не удаляется и не отправляется при любом числе flush-вызовов', async () => {
  await enqueueOutbox({ clientId: 'c1', payload: { text: 'from B only' } }, 'user-B');
  bindOutboxSession('user-A');
  for (let i = 0; i < 3; i++) {
    const sent = await flushOutbox(async () => { throw new Error('НЕ должно вызываться для чужой записи'); }, 'user-A');
    assert.equal(sent, 0);
  }
  assert.equal(await outboxCount(), 1);
});

await test('missing/blank/synthetic active id fail-closed и не вызывают sendFn', async () => {
  await enqueueOutbox({ clientId: 'c1', payload: { text: 'owned' } }, 'user-A');
  let calls = 0;
  for (const userId of [undefined, null, '', '   ', 'u_1723456789']) {
    const sent = await flushOutbox(async () => { calls++; }, userId);
    assert.equal(sent, 0);
  }
  assert.equal(calls, 0);
  assert.equal(await outboxCount(), 1);
});

await test('legacy/null owner quarantined и не присваивается новой сессии', async () => {
  await AsyncStorageMock.setItem('ur_chat_outbox', JSON.stringify([
    { clientId: 'c-legacy', payload: { text: 'legacy A' }, userId: null },
  ]));
  bindOutboxSession('user-B');
  let calls = 0;
  assert.equal(await flushOutbox(async () => { calls++; }, 'user-B'), 0);
  assert.equal(calls, 0);
  assert.equal(await outboxCount(), 1);
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
  bindOutboxSession('user-A');
  let calls = 0;
  const sent = await flushOutbox(async () => {
    calls++;
    if (calls === 2) throw new Error('network down');
  }, 'user-A');
  assert.equal(sent, 1);
  assert.equal(await outboxCount(), 1, 'второе сообщение остаётся в очереди на следующий flush');
});

await test('user switch до flush не отправляет payload A через callback сессии B', async () => {
  await enqueueOutbox({ clientId: 'a1', payload: { text: 'A secret' } }, 'user-A');
  bindOutboxSession('user-A');
  bindOutboxSession('user-B');
  const sentPayloads = [];
  assert.equal(await flushOutbox(async (payload) => sentPayloads.push(payload), 'user-A'), 0);
  assert.equal(await flushOutbox(async (payload) => sentPayloads.push(payload), 'user-B'), 0);
  assert.deepEqual(sentPayloads, []);
  assert.equal(await outboxCount(), 1);
});

await test('race: switch во время A flush останавливает хвост A', async () => {
  await enqueueOutbox({ clientId: 'a1', payload: { n: 1 } }, 'user-A');
  await enqueueOutbox({ clientId: 'a2', payload: { n: 2 } }, 'user-A');
  bindOutboxSession('user-A');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const running = flushOutbox(async (payload, guard) => {
    assert.equal(guard.userId, 'user-A');
    assert.equal(guard.isCurrent(), true);
    calls.push(payload.n);
    await gate;
  }, 'user-A');
  await new Promise((resolve) => setImmediate(resolve));
  bindOutboxSession('user-B');
  release();
  assert.equal(await running, 1);
  assert.deepEqual(calls, [1], 'после switch второй payload A не должен стартовать');
  assert.equal(await outboxCount(), 1);
});

await test('logout race очищает очередь и не даёт in-flight flush воскресить хвост', async () => {
  await enqueueOutbox({ clientId: 'a1', payload: { n: 1 } }, 'user-A');
  await enqueueOutbox({ clientId: 'a2', payload: { n: 2 } }, 'user-A');
  bindOutboxSession('user-A');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const running = flushOutbox(async () => { calls++; await gate; }, 'user-A');
  await new Promise((resolve) => setImmediate(resolve));
  const clearing = clearOutbox();
  release();
  await Promise.all([running, clearing]);
  assert.equal(calls, 1);
  assert.equal(await outboxCount(), 0);
});

await test('concurrent same-user flush не отправляет один clientId дважды', async () => {
  await enqueueOutbox({ clientId: 'a1', payload: { n: 1 } }, 'user-A');
  bindOutboxSession('user-A');
  let calls = 0;
  const [first, second] = await Promise.all([
    flushOutbox(async () => { calls++; }, 'user-A'),
    flushOutbox(async () => { calls++; }, 'user-A'),
  ]);
  assert.equal(first + second, 1);
  assert.equal(calls, 1);
});

await test('App global startup/resume flush передаёт bound session.user.id', async () => {
  const app = await readFile(new URL('../../App.js', import.meta.url), 'utf8');
  assert.match(app, /bindOutboxSession\(sessionUserId\)/);
  assert.match(app, /flushOutbox\([\s\S]*?,\s*boundUserId\)/);
  assert.match(app, /invalidateOutboxSession\(boundUserId\)/);
});

console.log(`\n${failed === 0 ? 'ВСЕ ЗЕЛЁНЫЕ' : failed + ' FAIL'} (passed=${passed}, failed=${failed})`);
process.exit(failed === 0 ? 0 : 1);
