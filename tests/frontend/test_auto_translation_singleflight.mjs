import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const start = source.indexOf('  React.useEffect(() => {\n    const targetLang = getLanguage().toLowerCase();');
const end = source.indexOf('\n\n  React.useEffect(', start + 1);
assert.ok(start >= 0 && end > start);
const effectSource = source.slice(start, end);
const manualMarker = source.indexOf('const current = translations[item.id];');
const manualStart = source.lastIndexOf('onPress={async () => {', manualMarker) + 'onPress={'.length;
const manualEnd = source.indexOf('\n                    }}', manualMarker) + '\n                    }'.length;
assert.ok(manualMarker > 0 && manualStart > 0 && manualEnd > manualStart);
const manualSource = source.slice(manualStart, manualEnd);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture(translate) {
  const queue = { scope: null, running: false, enabled: false, attempted: new Set(), pending: new Set() };
  let translations = {};
  const calls = [];
  const state = { roomId: 'room-1', lang: 'ru', messages: [], autoTranslate: true, historyStatus: 'ready' };
  function render() {
    vm.runInNewContext(effectSource, {
      React: { useEffect: (fn) => fn() },
      getLanguage: () => state.lang,
      roomId: state.roomId,
      session: { user: { id: 'user-1' } },
      autoTranslationRef: { current: queue },
      setTranslations: (update) => {
        translations = typeof update === 'function' ? update(translations) : update;
      },
      autoTranslate: state.autoTranslate,
      historyStatus: state.historyStatus,
      messages: state.messages,
      translations,
      lang: state.lang,
      chatAPI: { translate: (id, lang) => {
        calls.push([id, lang]);
        return translate(id, lang);
      } },
    });
  }
  function manualTap(item) {
    const handler = vm.runInNewContext('(' + manualSource + ')', {
      item, translations, roomId: state.roomId, session: { user: { id: 'user-1' } },
      getLanguage: () => state.lang, autoTranslationRef: { current: queue },
      setTranslating: () => {},
      setTranslations: (update) => {
        translations = typeof update === 'function' ? update(translations) : update;
      },
      chatAPI: { translate: (id, lang) => {
        calls.push([id, lang]);
        return translate(id, lang);
      } },
      toast: () => {}, t: () => 'translation_unavailable',
    });
    return handler();
  }
  return { state, calls, render, manualTap, queue, getTranslations: () => translations };
}

test('one slow translation stays one request across polling and render', async () => {
  const wait = deferred();
  const f = fixture(() => wait.promise);
  f.state.messages = [{ id: 101, text: '你好', mine: false }];
  f.render(); // room initialization
  f.render();
  f.render(); // new message array on every 3-second poll
  f.state.messages = [...f.state.messages];
  f.render();
  assert.deepEqual(f.calls, [[101, 'ru']]);
  wait.resolve({ translated_text: 'Привет', provider: 'local_ai' });
  await tick();
  f.render();
  assert.equal(f.getTranslations()[101].text, 'Привет');
  assert.deepEqual(f.calls, [[101, 'ru']]);
});

test('next message waits; rerenders cannot send it twice', async () => {
  const a = deferred(), b = deferred();
  const f = fixture((id) => (id === 101 ? a.promise : b.promise));
  f.state.messages = [{ id: 101, text: '你好' }, { id: 102, text: '你好' }];
  f.render();
  f.render();
  f.render();
  assert.deepEqual(f.calls, [[101, 'ru']]);
  a.resolve({ translated_text: 'Первое', provider: 'local_ai' });
  await tick();
  f.render();
  assert.deepEqual(f.calls, [[101, 'ru'], [102, 'ru']]);
  b.resolve({ translated_text: 'Второе', provider: 'local_ai' });
  await tick();
  f.render();
  assert.equal(f.getTranslations()[102].text, 'Второе');
  assert.deepEqual(f.calls, [[101, 'ru'], [102, 'ru']]);
});

test('422 failure does not submit the same AI work on every poll', async () => {
  const f = fixture(() => Promise.reject(new Error('422')));
  f.state.messages = [{ id: 101, text: 'тент 10 тонн' }];
  f.render();
  f.render();
  await tick();
  for (let poll = 0; poll < 4; poll += 1) {
    f.state.messages = [...f.state.messages];
    f.render();
  }
  assert.deepEqual(f.calls, [[101, 'ru']]);
  assert.equal(Object.keys(f.getTranslations()).length, 0);
});

test('old room or locale results never appear in the new room or locale', async () => {
  const old = deferred();
  const f = fixture((id) => (id === 101 ? old.promise : Promise.resolve({ translated_text: 'New', provider: 'local_ai' })));
  f.state.messages = [{ id: 101, text: 'old' }];
  f.render();
  f.render();
  f.state.roomId = 'room-2';
  f.state.lang = 'zh';
  f.render();
  f.state.messages = [{ id: 102, text: 'новое' }];
  f.render();
  old.resolve({ translated_text: 'Old', provider: 'local_ai' });
  await tick();
  assert.equal(f.getTranslations()[101], undefined);
  assert.equal(f.getTranslations()[102].text, 'New');
});

test('выключение автоперевода сохраняет сообщения для следующего включения', async () => {
  const first = deferred(), retry = deferred(), second = deferred();
  let firstAttempts = 0;
  const f = fixture((id) => (id === 101
    ? (++firstAttempts === 1 ? first.promise : retry.promise) : second.promise));
  f.state.messages = [{ id: 101, text: 'первое' }, { id: 102, text: 'второе' }];
  f.render();
  f.render();
  f.state.autoTranslate = false;
  f.render();
  first.resolve({ translated_text: 'One', provider: 'local_ai' });
  await tick();
  assert.deepEqual(f.calls, [[101, 'ru']]);
  f.state.autoTranslate = true;
  f.render();
  assert.deepEqual(f.calls, [[101, 'ru'], [101, 'ru']]);
  retry.resolve({ translated_text: 'One', provider: 'local_ai' });
  await tick();
  assert.deepEqual(f.calls, [[101, 'ru'], [101, 'ru'], [102, 'ru']]);
  second.resolve({ translated_text: 'Two', provider: 'local_ai' });
  await tick();
  assert.equal(f.getTranslations()[102].text, 'Two');
});

test('ручная кнопка не дублирует авто-запрос и остаётся доступна после 422', async () => {
  const wait = deferred();
  const f = fixture(() => wait.promise);
  const message = { id: 101, text: '你好' };
  f.state.messages = [message];
  f.render();
  f.render();
  await f.manualTap(message);
  assert.deepEqual(f.calls, [[101, 'ru']]);
  wait.reject(new Error('422'));
  await tick();
  assert.equal(f.queue.pending.size, 0);
  await f.manualTap(message);
  assert.deepEqual(f.calls, [[101, 'ru'], [101, 'ru']]);
});
