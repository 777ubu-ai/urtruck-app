import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceTranscriptState } from '../../src/utils/voiceTranscriptState.js';

const voice = { id: 'v', voice: true };
const transcript = { transcript_text: 'Груз 10 тонн', source_lang: 'ru', provider: 'openai' };
const translation = { translated_text: '货物10吨', target_lang: 'zh', provider: 'openai' };
function fixture(result, options = {}) {
  const calls = [];
  const api = {
    voiceText: async () => { calls.push('reveal'); return typeof result === 'function' ? result() : result; },
    transcribe: async () => { calls.push('stt'); return { ...transcript, translated_text: translation.translated_text, target_lang: 'zh', translation_provider: 'openai' }; },
    translate: async () => { calls.push('translate'); if (options.fail) throw new Error('offline'); return translation; },
    recognizeVoiceAgain: async () => { calls.push('recognize'); return { status: 'queued' }; },
  };
  return { state: createVoiceTranscriptState(api), calls, options };
}

test('реальный набор API методов позволяет распознать legacy unavailable по одному tap', async () => {
  const h = fixture({ status: 'unavailable' });
  h.state.hydrate([voice]); assert.deepEqual(h.calls, []);
  await Promise.all([h.state.toggle(voice, 'zh'), h.state.toggle(voice, 'zh')]);
  assert.deepEqual(h.calls, ['reveal', 'stt']);
  assert.equal(h.state.view('v', 'zh').translatedText, translation.translated_text);
});

test('первый reveal ready без целевого перевода переводит текст без нового STT', async () => {
  const h = fixture({ status: 'ready', ...transcript });
  await h.state.toggle(voice, 'zh');
  assert.deepEqual(h.calls, ['reveal', 'translate']);
  assert.equal(h.state.view('v', 'zh').translatedText, translation.translated_text);
});

test('translation failure показывает original/error и retry повторяет только перевод', async () => {
  const h = fixture({ status: 'ready', ...transcript }, { fail: true });
  await h.state.toggle(voice, 'zh');
  assert.equal(h.state.view('v', 'zh').transcriptText, transcript.transcript_text);
  assert.equal(h.state.view('v', 'zh').translationError, true);
  h.options.fail = false; await h.state.retry(voice, 'zh');
  assert.deepEqual(h.calls, ['reveal', 'translate', 'translate']);
});

test('queued/processing не превращаются в legacy STT', async () => {
  for (const status of ['queued', 'processing', 'failed_retryable', 'failed_permanent', 'expired']) {
    const h = fixture({ status }); await h.state.toggle(voice, 'zh');
    assert.deepEqual(h.calls, ['reveal']);
  }
});

test('готовый same-language transcript не вызывает перевод', async () => {
  const h = fixture({ status: 'ready', ...transcript }); await h.state.toggle(voice, 'ru');
  assert.deepEqual(h.calls, ['reveal']);
});

test('поздний reveal после disconnect не запускает перевод и не раскрывает старый текст', async () => {
  let resolve; const pending = new Promise((r) => { resolve = r; });
  const h = fixture(() => pending); const disconnect = h.state.connect(() => {});
  const operation = h.state.toggle(voice, 'zh'); await new Promise((r) => setImmediate(r));
  disconnect(); h.state.connect(() => {}); resolve({ status: 'ready', ...transcript }); await operation;
  assert.deepEqual(h.calls, ['reveal']); assert.equal(h.state.view('v', 'zh'), undefined);
});
