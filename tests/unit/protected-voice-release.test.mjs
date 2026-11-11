import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseProtectedVoice } from '../../src/utils/protectedVoiceRelease.js';

test('при прокрутке активное воспроизведение продолжается, после остановки Blob освобождается', () => {
  let listener, unsubscribed = 0;
  const revoked = [];
  const voice = { getState: () => ({ uri: 'blob:one', isPlaying: true }), subscribe: fn => { listener = fn; return () => { unsubscribed++; }; } };
  releaseProtectedVoice({ uri: 'blob:one', voice, accountChanged: false, revoke: uri => revoked.push(uri) });
  assert.deepEqual(revoked, []);
  listener({ uri: 'blob:one', isPlaying: false });
  listener({ uri: null, isPlaying: false });
  assert.deepEqual(revoked, ['blob:one']);
  assert.equal(unsubscribed, 1);
});

test('при смене аккаунта плеер останавливается, затем Blob удаляется', async () => {
  let stopped = false;
  const revoked = [];
  const voice = { getState: () => ({ uri: 'blob:one', isPlaying: true }), stop: async () => { stopped = true; } };
  releaseProtectedVoice({ uri: 'blob:one', voice, accountChanged: true, revoke: uri => revoked.push(uri) });
  await Promise.resolve();
  assert.equal(stopped, true);
  assert.deepEqual(revoked, ['blob:one']);
});

test('неактивный Blob освобождается сразу', () => {
  const revoked = [];
  releaseProtectedVoice({ uri: 'blob:one', voice: { getState: () => ({ uri: 'blob:two', isPlaying: true }) }, revoke: uri => revoked.push(uri) });
  assert.deepEqual(revoked, ['blob:one']);
});
