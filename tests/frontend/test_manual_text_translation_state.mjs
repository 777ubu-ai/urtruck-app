import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualTextTranslationState, manualTextTranslationCacheKey } from '../../src/utils/manualTextTranslationState.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise((done) => setImmediate(done));
const result = (text = '货物10吨', target = 'zh') => ({ translated_text: text, target_lang: target, provider: 'local_nllb_1_3b' });

function fixture({ translate, cached = {} } = {}) {
  const calls = [];
  const writes = [];
  const storage = {
    get: async (key) => cached[key] || null,
    set: async (key, value) => { writes.push([key, value]); },
  };
  const api = { translate: async (id, language) => {
    calls.push([id, language]);
    return translate ? translate(id, language) : result();
  } };
  return { state: createManualTextTranslationState(api, storage, { roomId: 'room-a', userId: 'user-a', language: 'ZH' }), calls, writes };
}

test('hydrate/polling читает кэш, но не запускает AI', async () => {
  const key = manualTextTranslationCacheKey('room-a', 'user-a', 'zh');
  const { state, calls } = fixture({ cached: { [key]: JSON.stringify({ m1: { text: '已保存', provider: 'local_nllb_1_3b' } }) } });
  await state.hydrate();
  assert.equal(state.view('m1').translation.text, '已保存');
  assert.deepEqual(calls, []);
});

test('двойной tap создаёт ровно один запрос, сохраняет original-перевод и кэш', async () => {
  const wait = deferred();
  const { state, calls, writes } = fixture({ translate: () => wait.promise });
  const first = state.translate('m1');
  const second = state.translate('m1');
  await tick();
  assert.deepEqual(calls, [['m1', 'zh']]);
  wait.resolve(result('货物10吨'));
  await Promise.all([first, second]);
  assert.equal(state.view('m1').translation.text, '货物10吨');
  assert.equal(writes.length, 1);
});

test('ошибка разрешает явный retry без cache poisoning', async () => {
  let attempt = 0;
  const { state, calls } = fixture({ translate: async () => (++attempt === 1 ? null : result('重试成功')) });
  await state.translate('m1');
  assert.equal(state.view('m1').translation, null);
  assert.ok(state.view('m1').error);
  await state.retry('m1');
  assert.equal(state.view('m1').translation.text, '重试成功');
  assert.deepEqual(calls, [['m1', 'zh'], ['m1', 'zh']]);
});

test('поздний ответ после смены комнаты/языка или logout не публикуется', async () => {
  const wait = deferred();
  const { state } = fixture({ translate: () => wait.promise });
  const disconnect = state.connect(() => {});
  const request = state.translate('private-message');
  await tick();
  disconnect();
  wait.resolve(result('не должен появиться'));
  await request;
  assert.equal(state.view('private-message').translation, null);
  const roomB = createManualTextTranslationState({ translate: async () => result('English', 'en') }, { get: async () => null, set: async () => {} }, { roomId: 'room-b', userId: 'user-b', language: 'EN' });
  assert.equal(roomB.view('private-message').translation, null);
});

test('кэш разделён по комнате, пользователю и языку; logout не открывает private cache', async () => {
  const ru = manualTextTranslationCacheKey('room-a', 'user-a', 'ru');
  const zh = manualTextTranslationCacheKey('room-a', 'user-a', 'zh');
  const otherRoom = manualTextTranslationCacheKey('room-b', 'user-a', 'zh');
  const otherUser = manualTextTranslationCacheKey('room-a', 'user-b', 'zh');
  assert.notEqual(ru, zh);
  assert.notEqual(zh, otherRoom);
  assert.notEqual(zh, otherUser);
  const state = createManualTextTranslationState({ translate: async () => result() }, { get: async (key) => key === zh ? JSON.stringify({ m1: { text: 'private', provider: 'local_nllb_1_3b' } }) : null, set: async () => {} }, { roomId: 'room-a', userId: null, language: 'ZH' });
  await state.hydrate();
  assert.equal(state.view('m1').translation, null);
});
