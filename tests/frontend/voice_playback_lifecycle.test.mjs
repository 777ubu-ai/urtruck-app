// P1-voice behavioral tests (2026-09-09).
//
// Подтверждённый дефект: после естественного завершения трека _sound не
// выгружается (by design), а при переключении на другой URI play() читал
// необъявленную переменную _playResolve (strict mode → ReferenceError) →
// catch → return false, при этом unloadAsync() НЕ выполнялся и _sound
// оставался stale — все последующие попытки воспроизведения другого бабла
// падали бесконечно (пользователь видел toast 'voice_play_fail').
//
// Тут гоняется РЕАЛЬНЫЙ src/utils/voiceRecorder.js под plain Node с shim'ом
// expo-av (mocks/expo_av_shim.mjs): без устройства, без Metro/Expo.
// Первый тест — точный reproduce-сценарий, остальные — lifecycle-инварианты.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installExpoAvRequireShim } from './mocks/expo_av_shim.mjs';
import { voice } from '../../src/utils/voiceRecorder.js';

const shim = installExpoAvRequireShim();

const URI_A = 'file:///voice/a.m4a';
const URI_B = 'file:///voice/b.m4a';
const URI_C = 'file:///voice/c.m4a';

const lastSound = () => shim.state.sounds[shim.state.sounds.length - 1];
// Звуки, которые реально занимают «слот» плеера: созданы и не выгружены.
const liveSounds = () => shim.state.sounds.filter((s) => s.loaded && !s.unloaded);
// Естественное завершение: то, что нативно шлёт expo-av через onPlaybackStatusUpdate.
const finishNaturally = (sound) => sound._emit({ didJustFinish: true });

test.beforeEach(async () => {
  await voice.stop();
  shim.state.sounds.length = 0;
  shim.state.audioModeCalls.length = 0;
  shim.state.createAsyncThrows = null;
  shim.state.playAsyncThrows = null;
});

// ─── REPRODUCE (P1): play A → natural completion → play B ───
test('REPRODUCE: natural completion of A, then switching to B plays B', async () => {
  assert.equal(await voice.play(URI_A), true, 'play A must succeed');
  const soundA = lastSound();
  assert.equal(voice.getState().uri, URI_A);

  finishNaturally(soundA);
  assert.equal(voice.getState().isPlaying, false, 'after completion player is idle');
  assert.equal(soundA.unloaded, false, 'by design sound A is NOT unloaded on completion');

  // Дефект: этот вызов падает с ReferenceError(_playResolve) → false навсегда.
  assert.equal(await voice.toggle(URI_B), true, 'switching to B after A completed must succeed');
  const soundB = lastSound();
  assert.equal(voice.getState().uri, URI_B);
  assert.equal(voice.getState().isPlaying, true);
  assert.equal(soundB.playing, true, 'sound B is actually playing');
  assert.equal(soundA.unloaded, true, 'previous sound A is unloaded on switch');
  assert.equal(liveSounds().length, 1, 'exactly one active sound after switch');
});

test('A → B → C chain: each switch stops and cleans the previous sound', async () => {
  await voice.play(URI_A);
  const soundA = lastSound();
  assert.equal(await voice.play(URI_B), true);
  const soundB = lastSound();
  assert.equal(soundA.unloaded, true);
  assert.equal(await voice.play(URI_C), true);
  const soundC = lastSound();
  assert.equal(soundB.unloaded, true);
  assert.equal(soundC.playing, true);
  assert.equal(liveSounds().length, 1, 'exactly one live sound: C only');
  assert.equal(voice.getState().uri, URI_C);
});

test('pause / resume of the same track', async () => {
  await voice.toggle(URI_A);
  const soundA = lastSound();
  assert.equal(voice.getState().isPlaying, true);

  assert.equal(await voice.toggle(URI_A), true, 'second tap pauses');
  assert.equal(soundA.playing, false);
  assert.equal(voice.getState().isPlaying, false);
  assert.equal(liveSounds().length, 1, 'pause keeps the sound loaded (instant resume)');

  assert.equal(await voice.toggle(URI_A), true, 'third tap resumes');
  assert.equal(soundA.playing, true);
  assert.equal(voice.getState().isPlaying, true);
});

test('natural completion → replay of the SAME uri works instantly', async () => {
  await voice.play(URI_A);
  const soundA = lastSound();
  finishNaturally(soundA);
  assert.equal(voice.getState().isPlaying, false);
  assert.equal(voice.getState().positionMillis, 0, 'reset to start, WhatsApp-style');

  assert.equal(await voice.toggle(URI_A), true, 'replay after completion must work');
  assert.equal(soundA.playing, true, 'same sound resumes without re-create');
  assert.equal(voice.getState().isPlaying, true);
  assert.equal(shim.state.sounds.length, 1, 'no sound re-created on replay');
});

test('repeat playback: full play → completion cycle works twice in a row', async () => {
  await voice.play(URI_A);
  finishNaturally(lastSound());
  assert.equal(voice.getState().isPlaying, false);
  await voice.toggle(URI_A);
  assert.equal(lastSound().playing, true);
  finishNaturally(lastSound());
  assert.equal(voice.getState().isPlaying, false);
  assert.equal(voice.getState().positionMillis, 0);
  assert.equal(await voice.toggle(URI_A), true, 'third playback still works');
  assert.equal(shim.state.sounds.length, 1, 'single sound object across repeats');
});

test('seek and 1x/1.5x/2x rate are applied and survive track switch', async () => {
  await voice.play(URI_A);
  const soundA = lastSound();

  assert.equal(await voice.setRate(2), true);
  assert.equal(soundA.rate, 2, 'rate pushed to native sound with pitch correction arg');
  assert.equal(soundA.shouldCorrectPitchArg, true);

  assert.equal(await voice.seek(URI_A, 1500), true);
  assert.equal(soundA.positionMillis, 1500);
  assert.equal(voice.getState().positionMillis, 1500);

  // Переключение: скорость сохраняется между треками (WhatsApp-паритет),
  // позиция — нет.
  assert.equal(await voice.play(URI_B), true);
  const soundB = lastSound();
  assert.equal(soundB.rate, 2, 'rate carried into the new track initialStatus');
  assert.equal(voice.getState().rate, 2);
  assert.equal(voice.getState().positionMillis, 0, 'position resets on switch');

  assert.equal(await voice.setRate(1.5), true);
  assert.equal(voice.getState().rate, 1.5);
});

test('seek/rate are rejected for a non-active uri and do not corrupt state', async () => {
  await voice.play(URI_A);
  assert.equal(await voice.seek(URI_B, 1000), false, 'cannot seek a track that is not playing');
  assert.equal(voice.getState().uri, URI_A);
  assert.equal(voice.getState().positionMillis, 0);
});

test('manual stop unloads the sound and resets state; next play works', async () => {
  await voice.play(URI_A);
  const soundA = lastSound();
  await voice.stop();
  assert.equal(soundA.unloaded, true);
  assert.equal(soundA.playing, false);
  assert.deepEqual(
    { uri: voice.getState().uri, isPlaying: voice.getState().isPlaying, positionMillis: voice.getState().positionMillis },
    { uri: null, isPlaying: false, positionMillis: 0 },
  );
  assert.equal(await voice.play(URI_B), true, 'play after stop works');
  assert.equal(liveSounds().length, 1);
});

test('player error path: play failure cleans up and the next play recovers', async () => {
  shim.state.createAsyncThrows = new Error('native createAsync boom');
  assert.equal(await voice.play(URI_A), false, 'createAsync failure surfaces as false');
  shim.state.createAsyncThrows = null;

  // Не должно остаться stale _sound / stale _playingUri: следующий play обязан работать.
  assert.equal(voice.getState().uri, null, 'state reset on error path');
  assert.equal(await voice.play(URI_B), true, 'playback recovers after a failed play');
  assert.equal(liveSounds().length, 1);
  assert.equal(voice.getState().uri, URI_B);
});

test('playAsync error after successful create also cleans up (no stale sound)', async () => {
  await voice.play(URI_A);
  const soundA = lastSound();
  shim.state.playAsyncThrows = new Error('native playAsync boom');
  assert.equal(await voice.play(URI_B), false);
  shim.state.playAsyncThrows = null;
  const soundB = lastSound();
  assert.equal(soundB.unloaded, true, 'half-open sound from the failed play is unloaded');
  assert.equal(liveSounds().length, 0, 'no live sound left after error');
  assert.equal(voice.getState().uri, null);

  assert.equal(await voice.play(URI_C), true, 'playback recovers');
  assert.equal(soundA.unloaded, true);
  assert.equal(liveSounds().length, 1);
});

test('unmount-style cleanup: stop during playback leaves no callbacks pending', async () => {
  await voice.play(URI_A);
  const soundA = lastSound();
  const unsub = voice.subscribe(() => {});
  await voice.stop();
  // stale status callback от выгруженного звука не должен менять состояние.
  soundA._emit({ isLoaded: true, isPlaying: true, positionMillis: 999, durationMillis: 5000 });
  assert.equal(voice.getState().positionMillis, 0, 'stale callback from unloaded sound is ignored');
  assert.equal(voice.getState().uri, null);
  unsub();
});

test('idle toggle is a safe no-op', async () => {
  assert.equal(await voice.toggle(''), false);
  assert.equal(await voice.play(null), false);
  assert.equal(liveSounds().length, 0);
});
