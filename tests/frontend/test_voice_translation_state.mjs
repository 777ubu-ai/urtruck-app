import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createVoiceTranscriptState, normalizeVoiceLanguage } from '../../src/utils/voiceTranscriptState.js';

const original = { id: 'v1', voice: true, transcript: '你好', transcriptLang: 'zh', transcriptProvider: 'openai' };
const translated = (lang, text = `text-${lang}`) => ({ translated_text: text, target_lang: lang, provider: 'openai' });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(overrides = {}) {
  const calls = [];
  const api = {
    transcribe: async (id, lang) => {
      calls.push(['stt', id, lang]);
      return overrides.transcribe ? overrides.transcribe(id, lang) : {
        transcript_text: '你好', source_lang: 'zh', provider: 'openai',
        translated_text: `text-${lang}`, target_lang: lang, translation_provider: 'openai',
      };
    },
    translate: async (id, lang) => { calls.push(['translate', id, lang]); return overrides.translate ? overrides.translate(id, lang) : translated(lang); },
  };
  return { api, calls, state: createVoiceTranscriptState(api) };
}
function screenCallback(name, context) {
  const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  const start = source.indexOf(`  const ${name} = React.useCallback(`);
  const end = source.indexOf('\n\n  ', start + 1);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(source.slice(start, end) + `\n${name};`, { React: { useCallback: (fn) => fn }, ...context });
}

test('F03: сохранённый ZH transcript после открытия чата получает RU перевод одним нажатием', async () => {
  const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  const start = source.indexOf('  const toggleVoiceTranscript = React.useCallback(');
  const end = source.indexOf('\n\n  const toggleVoiceOriginal', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const context = {
    React: { useCallback: (fn) => fn },
    voiceTranscripts: { v1: { transcriptText: '你好', sourceLang: 'zh', visible: false } },
    setVoiceTranscripts: () => {}, setVoiceTranscribing: () => {},
    t: (key) => key, getLanguage: () => 'RU',
    chatAPI: {
      transcribe: async (...args) => { calls.push(['stt', ...args]); return {}; },
      translate: async (...args) => { calls.push(['translate', ...args]); return { translated_text: 'Здравствуйте', provider: 'openai' }; },
    },
  };
  context.voiceText = createVoiceTranscriptState(context.chatAPI);
  context.voiceScope = 'scope';
  context.lang = 'RU';
  const toggle = vm.runInNewContext(source.slice(start, end) + '\ntoggleVoiceTranscript;', context);
  await toggle({ ...original, voiceScope: 'scope' });
  assert.deepEqual(calls, [['translate', 'v1', 'ru']]);
  assert.equal(context.voiceText.view('v1', 'ru').translatedText, 'Здравствуйте');
});

test('первое нажатие использует существующий объединённый STT/translation endpoint', async () => {
  const { state, calls } = fixture();
  await state.toggle({ id: 'new', voice: true }, 'RU');
  assert.deepEqual(calls, [['stt', 'new', 'ru']]);
  assert.equal(state.view('new', 'ru').translatedText, 'text-ru');
  assert.equal(state.view('new', 'ru').transcriptText, '你好');
});

test('одинаковый язык не требует translation, включая нормализацию кодов', async () => {
  for (const [source, target] of [['ru', 'RU'], ['rus', 'ru-RU'], ['Chinese', 'zh_CN'], ['kaz', 'KK']]) {
    const { state, calls } = fixture();
    await state.toggle({ ...original, transcriptLang: source }, target);
    assert.equal(calls.length, 0);
    assert.equal(state.view('v1', target).needsTranslation, false);
  }
  assert.equal(normalizeVoiceLanguage('auto'), '');
});

test('новое распознавание RU/RU не вызывает дополнительный перевод', async () => {
  const { state, calls } = fixture({ transcribe: async () => ({ transcript_text: 'Привет', source_lang: 'ru', provider: 'openai' }) });
  await state.toggle({ id: 'new' }, 'RU');
  assert.deepEqual(calls, [['stt', 'new', 'ru']]);
  assert.equal(state.view('new', 'ru').errorText, null);
});

test('повторное открытие и второй участник восстанавливают перевод из API без STT', async () => {
  const { api, calls } = fixture();
  for (let i = 0; i < 3; i += 1) {
    const state = createVoiceTranscriptState(api);
    state.hydrate([original]);
    await state.toggle(original, 'RU');
    assert.equal(state.view('v1', 'ru').translatedText, 'text-ru');
  }
  assert.equal(calls.filter(([stage]) => stage === 'stt').length, 0);
  assert.equal(calls.length, 3);
});

test('RU→ZH→EN→RU использует один original и cache каждого языка', async () => {
  const { state, calls } = fixture();
  await state.toggle(original, 'RU');
  await state.ensureVisible('ZH');
  assert.equal(state.view('v1', 'zh').needsTranslation, false);
  await state.ensureVisible('EN');
  await state.ensureVisible('RU');
  assert.deepEqual(calls, [['translate', 'v1', 'ru'], ['translate', 'v1', 'en']]);
  assert.equal(state.view('v1', 'ru').translatedText, 'text-ru');
});

test('поздний ответ RU не заменяет EN после смены языка', async () => {
  const ru = deferred(), en = deferred();
  const { state } = fixture({ translate: (_, lang) => lang === 'ru' ? ru.promise : en.promise });
  const first = state.toggle(original, 'RU');
  const second = state.ensureVisible('EN');
  en.resolve(translated('en', 'Hello'));
  await second;
  ru.resolve(translated('ru', 'Здравствуйте'));
  await first;
  assert.equal(state.view('v1', 'en').translatedText, 'Hello');
  assert.equal(state.view('v1', 'ru').translatedText, 'Здравствуйте');
});

test('смена языка во время STT не запускает второе распознавание', async () => {
  const stt = deferred();
  const { state, calls } = fixture({ transcribe: () => stt.promise });
  const first = state.toggle({ id: 'v1' }, 'RU');
  const second = state.ensureVisible('EN');
  await tick();
  stt.resolve({ transcript_text: '你好', source_lang: 'zh', provider: 'openai', translated_text: 'Привет', target_lang: 'ru', translation_provider: 'openai' });
  await Promise.all([first, second]);
  assert.deepEqual(calls, [['stt', 'v1', 'ru'], ['translate', 'v1', 'en']]);
  assert.equal(state.view('v1', 'en').translatedText, 'text-en');
});

test('двойной tap/retry до перерисовки отправляет один запрос', async () => {
  const wait = deferred();
  const { state, calls } = fixture({ translate: () => wait.promise });
  const first = state.toggle(original, 'RU');
  const second = state.toggle(original, 'RU');
  const third = state.retry(original, 'RU');
  assert.equal(state.view('v1', 'ru').transcribing, true);
  await tick();
  assert.equal(calls.length, 1);
  wait.resolve(translated('ru'));
  await Promise.all([first, second, third]);
  assert.equal(state.view('v1', 'ru').transcribing, false);
});

test('параллельные сообщения имеют независимые loading states', async () => {
  const a = deferred(), b = deferred();
  const { state } = fixture({ translate: (id) => id === 'v1' ? a.promise : b.promise });
  const first = state.toggle(original, 'RU');
  const second = state.toggle({ ...original, id: 'v2' }, 'RU');
  a.resolve(translated('ru'));
  await first;
  assert.equal(state.view('v1', 'ru').transcribing, false);
  assert.equal(state.view('v2', 'ru').transcribing, true);
  b.resolve(translated('ru'));
  await second;
});

test('STT failure повторяет STT, не раскрывает raw provider error', async () => {
  let attempt = 0;
  const { state, calls } = fixture({ transcribe: async () => {
    if (!attempt++) throw new Error('secret upstream payload');
    return { transcript_text: 'Привет', source_lang: 'ru', provider: 'openai' };
  } });
  await state.toggle({ id: 'v1' }, 'RU');
  assert.equal(state.view('v1', 'ru').errorText, 'voice_transcription_unavailable');
  assert.equal(state.view('v1', 'ru').translationError, false);
  await state.retry({ id: 'v1' }, 'RU');
  assert.equal(calls.filter(([stage]) => stage === 'stt').length, 2);
  assert.equal(state.view('v1', 'ru').errorText, null);
});

test('STT success + translation failure: retry повторяет только translation', async () => {
  const { state, calls } = fixture({ transcribe: async () => ({ transcript_text: '你好', source_lang: 'zh', provider: 'openai', translation_error: 'TRANSLATION_TIMEOUT' }) });
  await state.toggle({ id: 'v1' }, 'RU');
  assert.equal(state.view('v1', 'ru').translationError, true);
  assert.equal(state.view('v1', 'ru').transcriptText, '你好');
  assert.deepEqual(calls, [['stt', 'v1', 'ru']]);
  await state.retry({ id: 'v1' }, 'RU');
  assert.deepEqual(calls, [['stt', 'v1', 'ru'], ['translate', 'v1', 'ru']]);
  assert.equal(state.view('v1', 'ru').errorText, null);
});

test('ошибка переводится текущим t(), а не сохранённым сообщением старого языка', async () => {
  const { state } = fixture({ translate: async () => { throw Object.assign(new Error('raw provider text'), { code: 'TRANSLATION_TIMEOUT' }); } });
  await state.toggle(original, 'RU');
  assert.equal(state.view('v1', 'ru', (key) => key === 'err_TRANSLATION_TIMEOUT' ? 'Время истекло' : key).errorText, 'Время истекло');
  assert.equal(state.view('v1', 'ru', (key) => key === 'err_TRANSLATION_TIMEOUT' ? 'Timed out' : key).errorText, 'Timed out');
});

test('stub/empty/wrong-target/error provider не попадают в успешный cache', async () => {
  for (const result of [null, {}, translated('ru', ''), { ...translated('ru'), provider: 'stub' }, { ...translated('ru'), provider: 'google_stub' }, { ...translated('ru'), provider: 'openai_error' }, translated('en')]) {
    const { state, calls } = fixture({ translate: async () => result });
    await state.toggle(original, 'RU');
    assert.equal(state.view('v1', 'ru').translatedText, null);
    assert.equal(state.view('v1', 'ru').translationError, true);
    await state.retry(original, 'RU');
    assert.equal(calls.length, 2);
  }
});

test('очередной messages poll сохраняет открытый перевод и original toggle', async () => {
  const { state, calls } = fixture();
  await state.toggle(original, 'RU');
  state.toggleOriginal('v1', 'RU');
  state.hydrate([original]);
  assert.equal(state.view('v1', 'ru').showOriginal, true);
  assert.equal(state.view('v1', 'ru').translatedText, 'text-ru');
  assert.equal(state.view('v1', 'ru').visible, true);
  await state.ensureVisible('RU');
  assert.equal(calls.length, 1);
});

test('изменённый original не использует перевод прежнего текста', async () => {
  const { state, calls } = fixture();
  await state.toggle(original, 'RU');
  state.hydrate([{ ...original, transcript: '新的文本' }]);
  assert.equal(state.view('v1', 'ru').translatedText, null);
  await state.ensureVisible('RU');
  assert.equal(calls.length, 2);
});

test('unmount/account switch отменяет публикацию результата и последующие этапы', async () => {
  const wait = deferred();
  const { state, calls, api } = fixture({ transcribe: () => wait.promise });
  let updates = 0;
  const disconnect = state.connect(() => { updates += 1; });
  const first = state.toggle({ id: 'v1' }, 'RU');
  const second = state.ensureVisible('EN');
  await tick();
  disconnect();
  const afterDisconnect = updates;
  const nextUser = createVoiceTranscriptState(api);
  wait.resolve({ transcript_text: 'private', source_lang: 'zh', provider: 'openai' });
  await Promise.all([first, second]);
  assert.equal(state.view('v1', 'ru'), undefined);
  assert.equal(nextUser.view('v1', 'ru'), undefined);
  assert.equal(updates, afterDisconnect);
  assert.equal(calls.length, 1);
});

test('повторное connect после StrictMode cleanup не применяет старый запрос', async () => {
  const old = deferred();
  let attempt = 0;
  const { state } = fixture({ translate: async (_, lang) => ++attempt === 1 ? old.promise : translated(lang, 'fresh') });
  const disconnect = state.connect(() => {});
  const pending = state.toggle(original, 'RU');
  await tick();
  disconnect();
  const finalDisconnect = state.connect(() => {});
  await state.toggle(original, 'RU');
  old.resolve(translated('ru', 'stale'));
  await pending;
  assert.equal(state.view('v1', 'ru').translatedText, 'fresh');
  finalDisconnect();
});

test('actual workspace callbacks отклоняют сообщение предыдущей комнаты/аккаунта', async () => {
  const { state, calls } = fixture();
  const context = { voiceText: state, voiceScope: 'current', lang: 'RU' };
  await screenCallback('toggleVoiceTranscript', context)({ ...original, voiceScope: 'old' });
  await screenCallback('translateVoiceTranscript', context)({ ...original, voiceScope: 'old' });
  screenCallback('toggleVoiceOriginal', context)({ ...original, voiceScope: 'old' });
  assert.deepEqual(calls, []);
});

test('actual workspace retry callback не запускает STT для сохранённого transcript', async () => {
  const { state, calls } = fixture();
  state.hydrate([original]);
  await screenCallback('translateVoiceTranscript', { voiceText: state, voiceScope: 'current', lang: 'EN' })({ ...original, voiceScope: 'current' });
  assert.deepEqual(calls, [['translate', 'v1', 'en']]);
});

test('actual workspace message loader игнорирует поздний ответ другой сессии', async () => {
  const wait = deferred();
  const capturedState = {};
  const currentRef = { current: capturedState };
  const load = screenCallback('loadMessages', {
    roomId: 'old', session: { user: { id: 'old' } }, lang: 'RU', voiceScope: 'old',
    voiceText: capturedState, voiceStateRef: currentRef, mounted: { current: true },
    historyRequestRef: { current: null },
    chatAPI: { messages: () => wait.promise, listAttachments: async () => ({ attachments: [] }) },
  });
  const pending = load();
  currentRef.current = {};
  let payloadRead = false;
  wait.resolve({ get messages() { payloadRead = true; return [original]; } });
  await pending;
  assert.equal(payloadRead, false, 'payload старого аккаунта не должен обрабатываться даже внутри try/catch');
  const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(source, /if \(!mounted\.current \|\| voiceStateRef\.current !== voiceText\) return;/);
  assert.match(source, /voiceText\.hydrate\(mapped\)/);
  assert.match(source, /voiceText\.ensureVisible\(lang\)/);
  assert.match(source, /voiceText\.view\(item\.id, lang, t\)/);
});

test('actual bubble не показывает original как перевод во время ожидания', () => {
  const source = readFileSync('src/components/VoiceMessageBubble.js', 'utf8');
  const start = source.indexOf('  const textVisible =');
  const end = source.indexOf('  const transcriptLabel =', start);
  const read = (transcript) => vm.runInNewContext(source.slice(start, end) + '\n({textVisible, primaryTranscript, originalFallback});', { transcript });
  assert.equal(read({ visible: true, transcriptText: '你好', needsTranslation: true, transcribing: true }).textVisible, false);
  const error = read({ visible: true, transcriptText: '你好', needsTranslation: true, translationError: true });
  assert.equal(error.originalFallback, true);
  const success = read({ visible: true, transcriptText: '你好', translatedText: 'Привет', needsTranslation: true });
  assert.equal(success.primaryTranscript, 'Привет');
  assert.equal(success.originalFallback, false);
  assert.match(source, /testID="voice-original-fallback-label"/);
});
