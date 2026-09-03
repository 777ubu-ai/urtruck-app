/**
 * P0 2026-09-03 — Regression: голосовые сообщения (физически доказанные дефекты).
 *
 * Физический QA (Fedya, com.urtruck.app.qa2): permission выдан, запись
 * стартует, стоп выполняется — но voice bubble не появляется, сообщение
 * на backend не создаётся, получатель ничего не видит.
 *
 * Доказанные первопричины:
 *
 *   1. voiceRecorder.play() читал переменную `_playResolve`, которая НИКОГДА
 *      не объявлялась. Модуль — ES module (всегда strict mode), поэтому
 *      чтение необъявленной переменной бросает ReferenceError. Условие
 *      `if (_sound)` истинно начиная со ВТОРОГО воспроизведения, ошибка
 *      глушилась внешним catch → плеер молча умирал.
 *
 *   2. Unmount-cleanup в ChatScreen.js и DealWorkspaceScreen.js вызывал
 *      только voice.stop() (playback). Активная ЗАПИСЬ оставалась висеть
 *      (`_recording` != null), а expo-av допускает только один
 *      подготовленный Recording одновременно → все последующие
 *      startRecording() в сессии падали, ломая голосовые ВЕЗДЕ.
 *
 *   3. stopRecording() схлопывал любой отказ в `null` → вызывающий код
 *      показывал один генерик-тост, и отличить причину без logcat было
 *      невозможно ("silent disappearance").
 *
 * Run: node tests/frontend/test_voice_message_root_cause.mjs
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

const voiceSrc = read('src/utils/voiceRecorder.js');
const chatSrc = read('src/screens/ChatScreen.js');
const legacyDealSrc = read('src/screens/DealWorkspaceScreen.js');
const v2Src = read('src/screens/DealWorkspaceScreenV2.js');
const i18nSrc = read('src/utils/i18n.js');

// Идентификаторы надо искать только в КОДЕ: в комментариях этого файла
// намеренно упоминаются и `_playResolve` (описание удалённого бага), и
// `_finalDurationMillis` (поле expo-av) — без вырезания комментариев тест
// давал бы ложные срабатывания.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const voiceCode = stripComments(voiceSrc);

console.log('\n=== 1. Нет необъявленных модульных переменных (класс дефекта _playResolve) ===');
{
  // Собираем присваивания на уровне модуля: `_ident = ...` и `_ident;`
  // в чтении. Затем проверяем, что для каждого есть объявление.
  const used = new Set();
  for (const m of voiceCode.matchAll(/(?<![.\w$])(_[A-Za-z_$][\w$]*)\s*(?==[^=]|\))/g)) {
    used.add(m[1]);
  }
  // Плюс любые чтения в условиях `if (_ident)`
  for (const m of voiceCode.matchAll(/if\s*\(\s*(_[A-Za-z_$][\w$]*)\s*\)/g)) {
    used.add(m[1]);
  }
  const declared = new Set();
  for (const m of voiceCode.matchAll(/\b(?:let|const|var)\s+(_[A-Za-z_$][\w$]*)/g)) {
    declared.add(m[1]);
  }
  // this._webRecorder / this._webChunks — свойства объекта, не модульные
  const objectProps = new Set(['_webRecorder', '_webChunks', '_startTime', '_startWeb', '_stopWeb', '_playWeb']);
  const undeclared = [...used].filter((n) => !declared.has(n) && !objectProps.has(n));

  expect(
    undeclared.length === 0,
    `все модульные _переменные объявлены (необъявленных: ${undeclared.length ? undeclared.join(', ') : 'нет'})`
  );

  expect(
    !voiceCode.includes('_playResolve'),
    '_playResolve удалён из КОДА (была причина ReferenceError на 2-м воспроизведении)'
  );
}

console.log('\n=== 2. stopRecording() возвращает структурную причину, а не голый null ===');
{
  const m = voiceSrc.match(/async\s+stopRecording\s*\(\s*\)\s*\{([\s\S]*?)\n  \},/);
  expect(!!m, 'stopRecording() найден');
  if (m) {
    const body = m[1];
    expect(
      !/return\s+null\s*;/.test(body),
      'внутри stopRecording() нет `return null` (иначе причина отказа теряется)'
    );
    expect(
      body.includes("error: 'no_active_recording'"),
      "отсутствие активной записи возвращает error: 'no_active_recording'"
    );
    expect(
      body.includes("error: 'stop_failed'"),
      "отказ stopAndUnloadAsync() возвращает error: 'stop_failed'"
    );
    expect(
      body.includes("error: 'no_uri'"),
      "остановка без URI возвращает error: 'no_uri'"
    );
    // Контракт для существующих вызывающих (`!result?.uri`) должен сохраниться
    expect(
      /uri:\s*null/.test(body),
      'у отказов есть uri: null — контракт `!result?.uri` у вызывающих сохранён'
    );
    // Ссылка на Recording должна сниматься ДО await, иначе висящий объект
    // отравляет последующие записи (expo-av: только один Recording).
    const recNullIdx = body.indexOf('_recording = null');
    const stopIdx = body.indexOf('stopAndUnloadAsync');
    expect(
      recNullIdx !== -1 && stopIdx !== -1 && recNullIdx < stopIdx,
      '_recording обнуляется ДО await stopAndUnloadAsync() (не остаётся висеть при сбое)'
    );
  }
}

console.log('\n=== 3. Web-путь тоже структурный ===');
{
  expect(
    voiceSrc.includes("error: 'empty_recording'"),
    "пустая web-запись возвращает error: 'empty_recording'"
  );
  const stopWeb = voiceSrc.match(/_stopWeb\s*\(\s*\)\s*\{([\s\S]*?)\n  \},/);
  if (stopWeb) {
    expect(
      !/resolve\(null\)/.test(stopWeb[1]),
      '_stopWeb() не резолвит голый null'
    );
  }
}

console.log('\n=== 4. Unmount-cleanup снимает И запись, И воспроизведение ===');
for (const [name, src] of [['ChatScreen.js', chatSrc], ['DealWorkspaceScreen.js', legacyDealSrc]]) {
  // Берём cleanup-функцию размонтирования (useEffect с пустыми deps)
  const hasStopRecording = src.includes('voice.stopRecording');
  const hasStop = /voice\.stop\?\.\(\)/.test(src) || /voice\.stop\(\)/.test(src);
  expect(hasStopRecording, `${name}: cleanup вызывает voice.stopRecording() (освобождает микрофон)`);
  expect(hasStop, `${name}: cleanup вызывает voice.stop() (освобождает playback)`);
  // Порядок: сначала запись, потом playback
  const recIdx = src.indexOf('voice.stopRecording');
  const stopIdx = src.search(/voice\.stop\?\.\(\)/);
  if (recIdx !== -1 && stopIdx !== -1) {
    expect(recIdx < stopIdx, `${name}: stopRecording() идёт раньше stop()`);
  }
}

console.log('\n=== 5. Комната сделки показывает ПРИЧИНУ отказа, а не один генерик-тост ===');
{
  expect(
    v2Src.includes("voice_error_too_short"),
    'V2 использует voice_error_too_short для слишком короткой записи'
  );
  expect(
    /result\?\.error/.test(v2Src),
    'V2 читает result?.error (структурная причина от stopRecording)'
  );
  expect(
    /elapsedMs/.test(v2Src),
    'V2 измеряет фактическую длительность удержания (elapsedMs) для отличия too-short'
  );
  // Оптимистичный бабл обязан ставиться ДО upload — иначе при сбое
  // отправки пользователь не увидит ни бабла, ни retry.
  const bubbleIdx = v2Src.indexOf('setMessages((items) => [...items, voiceItem])');
  const uploadIdx = v2Src.indexOf('chatAPI.uploadChatVoice');
  expect(
    bubbleIdx !== -1 && uploadIdx !== -1 && bubbleIdx < uploadIdx,
    'optimistic voice bubble добавляется ДО uploadChatVoice (нет silent disappearance)'
  );
  expect(
    /sendStatus: 'failed'/.test(v2Src),
    'сбой upload/send переводит бабл в sendStatus failed (видимая ошибка + retry)'
  );
}

console.log('\n=== 6. i18n: новый ключ симметричен по всем 4 языкам ===');
{
  const count = (i18nSrc.match(/voice_error_too_short:/g) || []).length;
  expect(count === 4, `voice_error_too_short присутствует ровно в 4 языках (найдено ${count})`);
  // Ни одно значение не должно остаться русским в нерусских блоках
  expect(
    /voice_error_too_short: '录音太短/.test(i18nSrc),
    'ZH-значение переведено (не русская строка)'
  );
  expect(
    /voice_error_too_short: 'Recording too short/.test(i18nSrc),
    'EN-значение переведено'
  );
  expect(
    /voice_error_too_short: 'Жазба тым қысқа/.test(i18nSrc),
    'KK-значение переведено'
  );
}

console.log('\n=== 7. stopRecording() остаётся API-корректным для expo-av 15.0.2 ===');
{
  // Сверено с node_modules/expo-av/build/Audio/Recording.js:
  //   stopAndUnloadAsync() возвращает финальный статус (durationMillis) и
  //   реджектит при нативном сбое; getStatusAsync() ПОСЛЕ unload не бросает,
  //   а отдаёт _finalDurationMillis; getURI() валиден после остановки.
  expect(
    voiceSrc.includes('stopAndUnloadAsync'),
    'используется stopAndUnloadAsync() (корректный API expo-av 15)'
  );
  expect(
    voiceSrc.includes('getURI()'),
    'URI берётся через getURI()'
  );
  const pkg = JSON.parse(read('node_modules/expo-av/package.json'));
  expect(
    pkg.version.startsWith('15.'),
    `expo-av мажорная версия 15 (установлено ${pkg.version}) — контракт stopAndUnloadAsync подтверждён`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
