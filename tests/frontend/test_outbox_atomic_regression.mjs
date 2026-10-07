import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import AsyncStorage from './mocks/async-storage.mjs';
import { storage } from '../../src/utils/storage.js';
import { enqueueOutbox, flushOutbox, clearOutbox, outboxCount } from '../../src/utils/outbox.js';

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const item = (id) => ({ clientId: id, payload: { id } });
test.beforeEach(async () => { AsyncStorage.__reset(); await clearOutbox(); });

test('enqueue во время network await не теряется при удалении отправленного', async () => {
  await enqueueOutbox(item('A'), 'u');
  const entered = deferred(), release = deferred();
  const flush = flushOutbox(async () => { entered.resolve(); await release.promise; }, 'u');
  await entered.promise;
  await enqueueOutbox(item('B'), 'u');
  release.resolve();
  assert.equal(await flush, 1);
  assert.equal(await outboxCount(), 1);
  const sent = [];
  await flushOutbox(async (p) => sent.push(p.id), 'u');
  assert.deepEqual(sent, ['B']);
});

test('параллельные enqueue сохраняют обе записи', async () => {
  await Promise.all([enqueueOutbox(item('A'), 'u'), enqueueOutbox(item('B'), 'u')]);
  assert.equal(await outboxCount(), 2);
});

test('два flush не доставляют одну запись дважды', async () => {
  await enqueueOutbox(item('A'), 'u');
  const entered = deferred(), release = deferred(); let calls = 0;
  const send = async () => { calls++; entered.resolve(); await release.promise; };
  const first = flushOutbox(send, 'u'); await entered.promise;
  const second = flushOutbox(send, 'u'); release.resolve();
  assert.deepEqual(await Promise.all([first, second]), [1, 0]);
  assert.equal(calls, 1);
});

test('logout во время flush не восстанавливает очередь и не отправляет хвост', async () => {
  await enqueueOutbox(item('A'), 'u'); await enqueueOutbox(item('B'), 'u');
  const entered = deferred(), release = deferred(); const sent = [];
  const flush = flushOutbox(async (p) => { sent.push(p.id); entered.resolve(); await release.promise; }, 'u');
  await entered.promise; await clearOutbox(); release.resolve(); await flush;
  assert.deepEqual(sent, ['A']); assert.equal(await outboxCount(), 0);
});

test('51-я запись отклоняется без удаления предыдущих 50', async () => {
  for (let i = 0; i < 50; i++) await enqueueOutbox(item(String(i)), 'u');
  await assert.rejects(enqueueOutbox(item('overflow'), 'u'), /outbox_full/);
  assert.equal(await outboxCount(), 50);
});

test('подавленная storage ошибка не выдаётся за сохранённую очередь', async () => {
  const original = storage.set;
  storage.set = async () => {};
  try { await assert.rejects(enqueueOutbox(item('A'), 'u'), /outbox_storage_failed/); }
  finally { storage.set = original; }
  assert.equal(await outboxCount(), 0);
});

test('испорченная очередь не затирается новым сообщением', async () => {
  await storage.set('ur_chat_outbox', '{bad');
  await assert.rejects(enqueueOutbox(item('A'), 'u'));
  assert.equal(await storage.get('ur_chat_outbox'), '{bad');
});

test('экран не показывает queued, когда очередь не удалось сохранить', async () => {
  const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
  const body = source.split(/const sendRawText = React\.useCallback\(async \(body(?:, retryId = null)?\) => \{/)[1]
    .split('}, [roomId, recipientId, deal?.cargo_id')[0];
  const state = { messages: [] };
  const env = {
    roomId: 'r', recipientId: 'other', newClientId: () => 'local', nowTime: () => '',
    setMessages: (fn) => { state.messages = fn(state.messages); },
    setAttachOpen() {}, setCallMenuOpen() {}, setEmojiOpen() {}, setShowJumpLatest() {},
    nearBottomRef: { current: true }, setTimeout() {}, listRef: { current: null },
    deal: {}, params: {}, session: { user: { id: 'u' } }, loadMessages() {}, setRoomId() {},
    chatAPI: { send: async () => { throw Object.assign(new Error('offline'), { isNetwork: true }); } },
    enqueueOutbox: async () => { throw new Error('outbox_storage_failed'); },
    toast() {}, t: (key) => key,
  };
  const send = new Function(...Object.keys(env), `return async function(body, retryId = null) { ${body} };`)(...Object.values(env));
  await send('сохранить текст');
  assert.equal(state.messages[0].text, 'сохранить текст');
  assert.equal(state.messages[0].sendStatus, 'failed');
});
