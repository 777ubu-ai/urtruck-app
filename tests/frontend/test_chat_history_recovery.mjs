import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Исполняем реальное тело callback экрана, а не копию алгоритма загрузки.
const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const body = source.split('const loadMessages = React.useCallback(async () => {')[1]
  .split('}, [roomId, session?.user?.id, lang, voiceText, voiceScope]);')[0];

function harness(fetchMessages) {
  const state = { messages: [{ id: 'existing' }], status: null };
  const voiceText = { hydrate() {} };
  const env = {
    roomId: 'room', voiceScope: 'room/user', voiceText,
    historyRequestRef: { current: null }, mounted: { current: true },
    voiceStateRef: { current: voiceText },
    chatAPI: { messages: fetchMessages, listAttachments: async () => ({ attachments: [] }) },
    session: { user: { id: 'user' } }, lang: 'RU',
    attachmentUrlCache: { current: new Map() }, resolveAttachment: (x) => x,
    localizeSystemMessage: (x) => x, fmtMessageTime: () => '',
    documentKindFromFile: () => 'document', parseServerDate: () => new Date(0),
    lastCountRef: { current: 0 }, userScrolledAwayRef: { current: false },
    nearBottomRef: { current: true }, pendingAutoScrollRef: { current: false },
    initialMessagesLoadedRef: { current: false }, scheduleAutoScrollRef: { current: null },
    setMessages: (fn) => { state.messages = fn(state.messages); },
    setHistoryState: (value) => { state.status = value.status; },
    setShowJumpLatest() {}, setUnreadCount() {}, notifyChatRead() {}, refreshAppIconBadge() {},
  };
  const load = new Function(...Object.keys(env), `return async function() { ${body} };`)(...Object.values(env));
  return { env, state, load };
}

test('history error preserves messages and becomes retryable', async () => {
  let fail = true;
  const h = harness(async () => { if (fail) throw new Error('timeout'); return { messages: [] }; });
  await h.load();
  assert.equal(h.state.status, 'error');
  assert.deepEqual(h.state.messages, [{ id: 'existing' }]);
  assert.equal(h.env.historyRequestRef.current, null);
  fail = false;
  await h.load();
  assert.equal(h.state.status, 'ready');
  assert.deepEqual(h.state.messages, []);
});

test('malformed payload is not a valid empty history', async () => {
  for (const value of [{}, null, { messages: {} }, { messages: null }]) {
    const h = harness(async () => value);
    await h.load();
    assert.equal(h.state.status, 'error');
    assert.equal(h.state.messages[0].id, 'existing');
  }
});

test('polling does not overlap a slow history request', async () => {
  let resolve, calls = 0;
  const pending = new Promise((r) => { resolve = r; });
  const h = harness(() => { calls++; return pending; });
  const first = h.load();
  await h.load();
  assert.equal(calls, 1);
  resolve({ messages: [] });
  await first;
  assert.equal(h.state.status, 'ready');
  assert.equal(h.env.historyRequestRef.current, null);
});

test('late errors from a previous account do not change current state', async () => {
  let reject;
  const h = harness(() => new Promise((_, r) => { reject = r; }));
  const loading = h.load();
  h.env.voiceStateRef.current = {};
  reject(new Error('timeout'));
  await loading;
  assert.equal(h.state.status, null);
});

test('unavailable attachment remains visible as a message', async () => {
  const h = harness(async () => ({ messages: [{ id: 1, attachment_unavailable: true, photo_url: null, text: '' }] }));
  await h.load();
  assert.equal(h.state.messages.length, 1);
  assert.equal(h.state.messages[0].attachmentUnavailable, true);
  assert.equal(h.state.messages[0].photo, true);
  assert.equal(h.state.messages[0].mediaUrl, null);
});

test('empty label requires success and load failure exposes retry', () => {
  assert.match(source, /historyStatus === 'ready' \? ui.noMessages : t\('chat_history_loading'\)/);
  assert.match(source, /onPress=\{loadMessages\}[^\n]+testID="deal-chat-history-retry"/);
});
