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
    voiceText: overrides.voiceText ? async (id, lang) => {
      calls.push(['voiceText', id, lang]);
      return overrides.voiceText(id, lang);
    } : undefined,
    recognizeVoiceAgain: overrides.recognizeVoiceAgain ? async (id) => {
      calls.push(['recognizeAgain', id]);
      return overrides.recognizeVoiceAgain(id);
    } : undefined,
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

test('одинаковый язык не расходует переводчик, а изменённый original не получает старый cache', async () => {
  const { state, calls } = fixture();
  await state.toggle({ ...original, transcript: 'Груз 10 тонн', transcriptLang: 'ru' }, 'RU');
  assert.deepEqual(calls, []);
  await state.toggle(original, 'RU');
  assert.deepEqual(calls, [['translate', 'v1', 'ru']]);
  state.hydrate([{ ...original, transcript: '新的文本' }]);
  assert.equal(state.view('v1', 'RU').translatedText, null);
  await state.retry({ ...original, transcript: '新的文本' }, 'RU');
  assert.deepEqual(calls, [['translate', 'v1', 'ru'], ['translate', 'v1', 'ru']]);
});

test('две явные цели языка не подменяют результат поздним ответом', async () => {
  const ru = deferred();
  const en = deferred();
  const { state } = fixture({ translate: (_, lang) => (lang === 'ru' ? ru.promise : en.promise) });
  state.hydrate([original]);
  const ruTap = state.toggle(original, 'RU');
  const enTap = state.retry(original, 'EN');
  await tick();
  en.resolve(translated('en', 'Hello'));
  await enTap;
  ru.resolve(translated('ru', 'Здравствуйте'));
  await ruTap;
  assert.equal(state.view('v1', 'EN').translatedText, 'Hello');
  assert.equal(state.view('v1', 'RU').translatedText, 'Здравствуйте');
});

test('невалидный ответ не становится успешным кэшем и допускает повтор', async () => {
  for (const result of [null, {}, translated('ru', ''), { ...translated('ru'), provider: 'stub' }, { ...translated('ru'), provider: 'openai_error' }, translated('en')]) {
    const { state, calls } = fixture({ translate: async () => result });
    state.hydrate([original]);
    await state.toggle(original, 'RU');
    assert.equal(state.view('v1', 'RU').translatedText, null);
    assert.equal(state.view('v1', 'RU').translationError, true);
    await state.retry(original, 'RU');
    assert.equal(calls.length, 2);
  }
});

test('ошибка STT допускает явный retry без раскрытия ответа провайдера', async () => {
  let attempt = 0;
  const { state, calls } = fixture({ transcribe: async () => {
    if (!attempt++) throw new Error('private provider payload');
    return { transcript_text: 'Груз 10 тонн', source_lang: 'ru', provider: 'openai' };
  } });
  await state.toggle({ id: 'new', voice: true }, 'RU');
  assert.equal(state.view('new', 'RU').errorText, 'voice_transcription_unavailable');
  await state.retry({ id: 'new', voice: true }, 'RU');
  assert.equal(calls.filter(([kind]) => kind === 'stt').length, 2);
  assert.equal(state.view('new', 'RU').errorText, null);
});

test('размонтирование/смена пользователя не публикует устаревший голосовой результат', async () => {
  const wait = deferred();
  const { state, calls } = fixture({ transcribe: () => wait.promise });
  const disconnect = state.connect(() => {});
  const pending = state.toggle({ id: 'private-voice', voice: true }, 'RU');
  await tick();
  disconnect();
  wait.resolve({ transcript_text: 'private', source_lang: 'zh', provider: 'openai' });
  await pending;
  assert.equal(state.view('private-voice', 'RU'), undefined);
  assert.equal(calls.length, 1);
});

test('готовый background STT скрыт до Show text и не запускает inference повторно', async () => {
  const { state, calls } = fixture({ voiceText: async () => ({
    status: 'ready', transcript_text: 'Груз 10 тонн', source_lang: 'ru', provider: 'openai',
    translated_text: '货物10吨', target_lang: 'zh', translation_provider: 'openai',
  }) });
  const message = { id: 'bg-ready', voice: true, voiceProcessingStatus: 'ready', voiceTranscriptReady: true };
  state.hydrate([message]);
  assert.deepEqual(calls, []);
  await state.toggle(message, 'ZH');
  assert.deepEqual(calls, [['voiceText', 'bg-ready', 'zh']]);
  assert.equal(state.view('bg-ready', 'ZH').transcriptText, 'Груз 10 тонн');
  assert.equal(state.view('bg-ready', 'ZH').translatedText, '货物10吨');
});

test('queued/expired background state never starts STT from polling and requeue is explicit', async () => {
  const { state, calls } = fixture({
    voiceText: async () => ({ status: 'expired' }),
    recognizeVoiceAgain: async () => ({ status: 'queued' }),
  });
  const message = { id: 'bg-expired', voice: true, voiceProcessingStatus: 'expired' };
  state.hydrate([message]);
  await state.retry(message, 'RU');
  assert.deepEqual(calls, [['recognizeAgain', 'bg-expired']]);
  assert.equal(state.view('bg-expired', 'RU').backgroundStatus, 'queued');
});
