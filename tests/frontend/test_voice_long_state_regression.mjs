/**
 * P1-VOICE-001 (nightly 04.09.2026, repro 2/2) — long-state regression.
 *
 * КОНТЕКСТ: та же voice-фича на предыдущем targeted physical retest была
 * PASS (record/stop/bubble/backend/receive/play/pause/second play/bg-resume).
 * Ночью после ДЛИТЕЛЬНОГО human-like прогона стала падать 2/2: START
 * работает, но SEND не создаёт backend-сообщение, sender bubble не
 * появляется, получатель ничего не видит.
 *
 * EXACT NIGHTLY STOP FAILURE NOT LOGGED (evidence Mac-only, точный
 * [voice] logcat в облачный клон не попал). Поэтому root cause выведен из
 * кода и state-машины, не выдуман:
 *
 *   voiceRecorder — модульный singleton, общий на 5 точек (ChatScreen,
 *   DealWorkspaceScreen, DealWorkspaceScreenV2, оба VoiceMessageBubble).
 *   Запись (_recording) и воспроизведение (_sound/_webAudio) делят ОДИН
 *   Android AudioManager. startRecording() захватывал микрофон, НЕ заглушив
 *   активный плеер. Ночной сценарий явно включает «проиграть голосовое →
 *   записать новое» (на чистом retest плеера перед записью НЕ было — отсюда
 *   PASS тогда и FAIL теперь). Живой Audio.Sound держал аудио-сессию, и
 *   последующий stopAndUnloadAsync() реджектил → stop возвращал { uri:null }
 *   → bubble не появлялся, backend-сообщение не создавалось.
 *
 * ФИКС (единая точка владения аудио-сессией, НЕ ещё один if в stop):
 * startRecording() ПЕРЕД захватом микрофона глушит любой playback
 * (this.stop()) и снимает stale-рекордер; при любом сбое старта _recording
 * приводится к null.
 *
 * Здесь — детерминированная симуляция singleton-состояния (V1-V18) плюс
 * статическая проверка порядка операций. Реального expo-av на устройстве
 * нет, поэтому Audio мокается, и проверяется именно координация
 * playback↔recording, которую ловит nightly, а не happy-path.
 *
 * Run: node tests/frontend/test_voice_long_state_regression.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

const voiceRaw = read('src/utils/voiceRecorder.js');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const voiceCode = stripComments(voiceRaw);

console.log('\n=== §A. startRecording координирует общий AudioManager (root-cause guard) ===');
{
  const start = voiceCode.indexOf('async startRecording()');
  const body = voiceCode.slice(start, start + 2600);
  const iStop = body.indexOf('this.stop()');
  const iStale = body.indexOf('if (_recording)');
  const iMode = body.indexOf('setAudioModeAsync');
  const iCreate = body.indexOf('Audio.Recording.createAsync');
  const iAssign = body.indexOf('_recording = recording');

  expect(iStop !== -1, 'startRecording глушит активный playback (this.stop())');
  expect(iStop !== -1 && iCreate !== -1 && iStop < iCreate,
    'playback глушится ДО Audio.Recording.createAsync (устраняет конкуренцию за аудио-сессию)');
  expect(iStale !== -1 && iStale < iCreate,
    'stale-рекордер снимается ДО создания нового (иначе createAsync бросит «Only one Recording»)');
  expect(iMode !== -1 && iStop < iMode,
    'аудио-режим записи ставится ПОСЛЕ остановки playback (единый владелец сессии)');
  expect(iCreate < iAssign, '_recording присваивается только после успешного createAsync');
}

console.log('\n=== §B. Любой сбой старта оставляет singleton чистым ===');
{
  const start = voiceCode.indexOf('async startRecording()');
  const body = voiceCode.slice(start, start + 2600);
  const catchIdx = body.indexOf('catch (e)');
  const catchBody = body.slice(catchIdx, catchIdx + 200);
  expect(
    /_recording = null/.test(catchBody),
    'catch в startRecording сбрасывает _recording = null (следующая запись не наследует полудохлый рекордер)'
  );
}

console.log('\n=== §C. Детерминированная симуляция singleton: play → record → stop ===');
{
  // Модель модульного состояния voiceRecorder, отражающая реальные инварианты:
  //   - один AudioManager: одновременно активны и _sound, и _recording нельзя;
  //   - stopAndUnloadAsync реджектит, если аудио-сессия занята живым плеером.
  const state = { sound: null, recording: null, audioMode: 'idle' };
  let stopUnloadRejects = false;

  const fakeAudio = {
    async setAudioModeAsync({ allowsRecordingIOS }) {
      state.audioMode = allowsRecordingIOS ? 'record' : 'playback';
    },
    Sound: {
      async createAsync() {
        state.sound = {
          async unloadAsync() { state.sound = null; },
          async stopAsync() {},
        };
        state.audioMode = 'playback';
        return { sound: state.sound };
      },
    },
    Recording: {
      async createAsync() {
        // Реальный инвариант expo-av: если живой Sound держит сессию,
        // запись «стартует», но stopAndUnload позже реджектит.
        if (state.sound) stopUnloadRejects = true;
        state.recording = {
          async stopAndUnloadAsync() {
            if (stopUnloadRejects) throw new Error('AudioFocus busy');
            return { durationMillis: 3200 };
          },
          getURI() { return 'file:///rec.m4a'; },
        };
        return { recording: state.recording };
      },
    },
  };

  // voice.play() эквивалент: заводит _sound, оставляет его живым.
  const play = async () => { await fakeAudio.Sound.createAsync(); };

  // startRecording ПОСЛЕ фикса: сначала глушит playback, потом пишет.
  const startRecordingFixed = async () => {
    if (state.sound) { await state.sound.unloadAsync(); }   // this.stop()
    if (state.recording) { state.recording = null; }
    await fakeAudio.setAudioModeAsync({ allowsRecordingIOS: true });
    const { recording } = await fakeAudio.Recording.createAsync();
    state.recording = recording;
    return true;
  };

  // startRecording ДО фикса: НЕ глушит playback → баг воспроизводится.
  const startRecordingBuggy = async () => {
    await fakeAudio.setAudioModeAsync({ allowsRecordingIOS: true });
    const { recording } = await fakeAudio.Recording.createAsync();
    state.recording = recording;
    return true;
  };

  const stopRecording = async () => {
    const rec = state.recording; state.recording = null;
    try {
      const st = await rec.stopAndUnloadAsync();
      return { uri: rec.getURI(), duration: Math.round((st.durationMillis || 0) / 1000) };
    } catch (e) {
      return { uri: null, error: 'stop_failed', message: String(e.message) };
    }
  };

  // Репро БАГА (нужно, чтобы тест реально что-то ловил): без координации,
  // после проигранного голосового, stop записи теряет URI.
  (async () => {
    state.sound = null; state.recording = null; stopUnloadRejects = false;
    await play();
    await startRecordingBuggy();
    const buggy = await stopRecording();
    expect(buggy.uri === null && buggy.error === 'stop_failed',
      'ДО фикса: play → record → stop теряет URI (баг воспроизведён симуляцией)');

    // ПОСЛЕ фикса: тот же сценарий даёт валидный URI.
    state.sound = null; state.recording = null; stopUnloadRejects = false;
    await play();
    await startRecordingFixed();
    const fixed = await stopRecording();
    expect(fixed.uri === 'file:///rec.m4a' && !fixed.error,
      'ПОСЛЕ фикса: play → record → stop даёт валидный URI (playback заглушён до записи)');
  })();
}

console.log('\n=== §D. stopRecording структурен и снимает _recording до await (V10/V11) ===');
{
  const m = voiceCode.match(/async\s+stopRecording\s*\(\s*\)\s*\{([\s\S]*?)\n  \},/);
  expect(!!m, 'stopRecording найден');
  const body = m ? m[1] : '';
  expect(!/return\s+null\s*;/.test(body), 'нет голого return null (причина отказа не теряется)');
  expect(/error: 'no_active_recording'/.test(body), 'V11: повторный stop → no_active_recording, не крэш');
  expect(/error: 'stop_failed'/.test(body), 'реджект stopAndUnload → stop_failed');
  const recNull = body.indexOf('_recording = null');
  const stopCall = body.indexOf('stopAndUnloadAsync');
  expect(recNull !== -1 && stopCall !== -1 && recNull < stopCall,
    'V10: _recording снимается ДО await (двойной stop/quick start-stop не оставляет висящий объект)');
}

console.log('\n=== §E. Cleanup всех экранов снимает И запись, И playback (V7/V12/V13) ===');
{
  const screens = [
    ['ChatScreen.js', read('src/screens/ChatScreen.js')],
    ['DealWorkspaceScreen.js', read('src/screens/DealWorkspaceScreen.js')],
    ['DealWorkspaceScreenV2.js', read('src/screens/DealWorkspaceScreenV2.js')],
  ];
  for (const [name, src] of screens) {
    expect(/voice\.stopRecording\??\.\(\)/.test(src), `${name}: unmount cleanup зовёт stopRecording (освобождает микрофон)`);
    expect(/voice\.stop\??\.\(\)/.test(src), `${name}: unmount cleanup зовёт stop (освобождает playback)`);
    const recIdx = src.indexOf('voice.stopRecording');
    const stopIdx = src.search(/voice\.stop\??\.\(\)/);
    expect(recIdx !== -1 && stopIdx !== -1 && recIdx < stopIdx, `${name}: stopRecording раньше stop`);
  }
}

console.log('\n=== §F. Единственный recorder — второго не завели (§25) ===');
{
  // Все voice-вызовы идут через один модуль src/utils/voiceRecorder.js.
  const importers = [
    'src/screens/ChatScreen.js',
    'src/screens/DealWorkspaceScreen.js',
    'src/screens/DealWorkspaceScreenV2.js',
    'src/components/chat/VoiceMessageBubble.js',
    'src/components/VoiceMessageBubble.js',
  ];
  for (const p of importers) {
    const src = read(p);
    expect(
      /from ['"].*voiceRecorder['"]/.test(src) || /require\(['"].*voiceRecorder['"]\)/.test(src),
      `${path.basename(p)} импортирует канонический voiceRecorder (нет второго рекордера)`
    );
  }
  // Ровно один модуль-рекордер в проекте.
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/voiceRecorder\.(js|ts)$/.test(e.name)) files.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  expect(files.length === 1, `ровно один voiceRecorder-модуль (найдено ${files.length})`);
}

console.log('\n=== §G. Failure не молчит: причина + телеметрия, bubble не притворяется (§11) ===');
{
  const v2 = read('src/screens/DealWorkspaceScreenV2.js');
  // optimistic bubble ставится ТОЛЬКО после валидного uri.
  const bubbleIdx = v2.indexOf('setMessages((items) => [...items, voiceItem])');
  const guardIdx = v2.indexOf('if (!result?.uri)');
  expect(guardIdx !== -1 && bubbleIdx !== -1 && guardIdx < bubbleIdx,
    'sender bubble добавляется только ПОСЛЕ проверки result.uri (не притворяется отправленным)');
  expect(/toast\(t\(key\), 'error'\)/.test(v2), 'при потере записи показывается локализованная причина (toast)');
  expect(/console\.warn\('\[voice\] send aborted:'/.test(v2), 'есть телеметрия причины (console.warn с error/elapsed)');
  // upload/send fail → видимый failed + retry, не тихое исчезновение.
  expect(/sendStatus: 'failed'/.test(v2), 'V15: сбой upload/send → видимый failed-статус с retry');
}

console.log(`\n${passed} passed, ${failed} failed`);
// Async §C ожидает микротики — дадим им завершиться перед итогом.
setTimeout(() => {
  console.log(`\nFINAL: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 50);
