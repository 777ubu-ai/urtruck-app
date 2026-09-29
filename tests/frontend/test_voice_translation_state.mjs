import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVoiceTranscriptState, normalizeVoiceLanguage } from '../../src/utils/voiceTranscriptState.js';

const original = { id: 'v1', voice: true, transcript: '你好，货物10吨', transcriptLang: 'zh', transcriptProvider: 'openai' };
const translated = (lang, text = `text-${lang}`) => ({ translated_text: text, target_lang: lang, provider: 'openai' });
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(overrides = {}) {
  const calls = [];
  const api = {
    transcribe: async (id, lang) => {
      calls.push(['stt', id, lang]);
      return overrides.transcribe ? overrides.transcribe(id, lang) : {
        transcript_text: '你好，货物10吨', source_lang: 'zh', provider: 'openai',
        translated_text: `text-${lang}`, target_lang: lang, translation_provider: 'openai',
      };
    },
    translate: async (id, lang) => {
      calls.push(['translate', id, lang]);
      return overrides.translate ? overrides.translate(id, lang) : translated(lang);
    },
  };
  return { state: createVoiceTranscriptState(api), calls };
}

test('hydrate не вызывает STT и перевод: только явное нажатие toggle', async () => {
  const { state, calls } = fixture();
  state.hydrate([original]);
  assert.deepEqual(calls, []);
  await state.toggle(original, 'RU');
  assert.deepEqual(calls, [['translate', 'v1', 'ru']]);
  assert.equal(state.view('v1', 'RU').translatedText, 'text-ru');
});

test('новое голосовое запускает STT и перевод только после явного toggle', async () => {
  const { state, calls } = fixture();
  assert.deepEqual(calls, []);
  await state.toggle({ id: 'new', voice: true }, 'ZH');
  assert.deepEqual(calls, [['stt', 'new', 'zh']]);
  assert.equal(state.view('new', 'zh').transcriptText, '你好，货物10吨');
  assert.equal(state.view('new', 'zh').translatedText, 'text-zh');
});

test('двойное нажатие во время обработки использует один запрос', async () => {
  const wait = deferred();
  const { state, calls } = fixture({ translate: () => wait.promise });
  state.hydrate([original]);
  const first = state.toggle(original, 'RU');
  const second = state.toggle(original, 'RU');
  await tick();
  assert.equal(calls.length, 1);
  wait.resolve(translated('ru', 'Здравствуйте, груз 10 тонн'));
  await Promise.all([first, second]);
  assert.equal(calls.length, 1);
  assert.equal(state.view('v1', 'RU').translatedText, 'Здравствуйте, груз 10 тонн');
});

test('ошибка перевода сохраняет оригинальный transcript и разрешает retry', async () => {
  let attempt = 0;
  const { state, calls } = fixture({ translate: async (_, lang) => {
    attempt += 1;
    if (attempt === 1) throw Object.assign(new Error('timeout'), { code: 'TRANSLATION_TIMEOUT' });
    return translated(lang, 'Привет');
  } });
  state.hydrate([original]);
  await state.toggle(original, 'RU');
  assert.equal(state.view('v1', 'RU').transcriptText, '你好，货物10吨');
  assert.equal(state.view('v1', 'RU').translationError, true);
  await state.retry(original, 'RU');
  assert.deepEqual(calls, [['translate', 'v1', 'ru'], ['translate', 'v1', 'ru']]);
  assert.equal(state.view('v1', 'RU').translatedText, 'Привет');
});

test('компонент называет действие «Перевести», но audio-player независим', () => {
  const bubble = readFileSync('src/components/VoiceMessageBubble.js', 'utf8');
  assert.match(bubble, /t\('voice_translate'\)/);
  assert.match(bubble, /'voice-play-btn'/);
  assert.match(bubble, /testID="voice-transcription-btn"/);
});

test('нормализация языков сохраняет RU/ZH/EN contract', () => {
  assert.equal(normalizeVoiceLanguage('ru-RU'), 'ru');
  assert.equal(normalizeVoiceLanguage('zh_CN'), 'zh');
  assert.equal(normalizeVoiceLanguage('English'), 'en');
});
