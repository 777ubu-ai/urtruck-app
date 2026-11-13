import test from 'node:test';
import assert from 'node:assert/strict';
import { createProtectedVoicePool } from '../../src/utils/protectedVoicePool.js';

function fixture() {
  let state = { uri: null, isPlaying: false }, listener, disposed = 0;
  const voice = { getState: () => state, subscribe: fn => { listener = fn; fn(state); return () => { listener = null; }; } };
  const pool = createProtectedVoicePool(voice);
  const resource = { uri: 'blob:voice', dispose: () => { disposed++; } };
  return { pool, resource, get disposed() { return disposed; }, setState: next => { state = next; listener?.(next); } };
}

test('активная или поставленная на паузу запись сохраняет URI при прокрутке', () => {
  const f = fixture();
  f.pool.install('owner-room-message', f.resource);
  f.setState({ uri: 'blob:voice', isPlaying: true });
  f.pool.release('owner-room-message');
  assert.equal(f.disposed, 0);
  assert.equal(f.pool.acquire('owner-room-message').uri, 'blob:voice');
  f.setState({ uri: 'blob:voice', isPlaying: false });
  f.pool.release('owner-room-message');
  assert.equal(f.disposed, 0);
  f.setState({ uri: null, isPlaying: false });
  assert.equal(f.disposed, 1);
});

test('при старте плеера прокрутка не удаляет файл до завершения запуска', () => {
  const f = fixture();
  f.pool.install('scope', f.resource);
  f.pool.pending('scope', true);
  f.pool.release('scope');
  assert.equal(f.disposed, 0);
  f.setState({ uri: 'blob:voice', isPlaying: true });
  f.pool.pending('scope', false);
  assert.equal(f.disposed, 0);
  f.setState({ uri: null, isPlaying: false });
  assert.equal(f.disposed, 1);
});

test('отмена старта при смене сессии освобождает ресурс после ответа плеера', () => {
  const f = fixture();
  f.pool.install('old-owner-room-message', f.resource);
  f.pool.pending('old-owner-room-message', true);
  f.pool.release('old-owner-room-message');
  f.setState({ uri: null, isPlaying: false });
  assert.equal(f.disposed, 0);
  f.pool.pending('old-owner-room-message', false);
  assert.equal(f.disposed, 1);
  assert.equal(f.pool.acquire('old-owner-room-message'), null);
});

test('неактивный ресурс удаляется, повторный install не создаёт дубль', () => {
  const f = fixture(); let duplicateDisposed = 0;
  f.pool.install('scope', f.resource);
  assert.equal(f.pool.install('scope', { uri: 'other', dispose: () => { duplicateDisposed++; } }), f.resource);
  assert.equal(duplicateDisposed, 1);
  f.pool.release('scope'); f.pool.release('scope');
  assert.equal(f.disposed, 1);
});

test('результат остановки во время подписки не оставляет подписчика', () => {
  let calls = 0, disposed = 0, unsubscribed = 0;
  const voice = {
    getState: () => ({ uri: 'blob:voice', isPlaying: true }),
    subscribe: fn => { calls++; fn({ uri: null, isPlaying: false }); return () => { unsubscribed++; }; },
  };
  const pool = createProtectedVoicePool(voice);
  pool.install('scope', { uri: 'blob:voice', dispose: () => { disposed++; } });
  pool.release('scope');
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
  assert.equal(unsubscribed, 1);
});
