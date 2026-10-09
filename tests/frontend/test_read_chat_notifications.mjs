import test from 'node:test';
import assert from 'node:assert/strict';
import { dismissReadChatNotifications } from '../../src/utils/readChatNotifications.js';

const note = (identifier, room, date = 900, type = 'chat_message') => ({
  date, request: { identifier, content: { data: { room_id: room, type } } },
});
async function run(presented, options = {}, api = {}) {
  const old = globalThis.require;
  const calls = [];
  globalThis.require = () => ({
    getPresentedNotificationsAsync: async () => presented,
    dismissNotificationAsync: async (id) => { calls.push(id); },
    ...api,
  });
  try {
    const result = await dismissReadChatNotifications('room-a', { readBefore: 1000, ...options });
    return { result, calls };
  } finally { globalThis.require = old; }
}
test('read removes older same-room chat and attachments, preserving other room and business alerts', async () => {
  const { calls } = await run([
    note('read-text', 'room-a'), note('read-doc', 'room-a', 900, 'chat_attachment'),
    note('other', 'room-b'), note('bid', 'room-a', 900, 'bid_received'),
  ]);
  assert.deepEqual(calls, ['read-text', 'read-doc']);
});
test('push arriving after request-start remains presented', async () => {
  assert.deepEqual((await run([note('old', 'room-a'), note('new', 'room-a', 1001)])).calls, ['old']);
});
test('missing date and missing identifier are preserved rather than guessed', async () => {
  const invalid = note('invalid', 'room-a'); delete invalid.date;
  assert.deepEqual((await run([invalid, note('', 'room-a'), note('zero', 'room-a', 0)])).calls, []);
});
test('room/session focus changing during OS enumeration prevents dismissal', async () => {
  let current = true;
  const out = await run([note('private', 'room-a')], { isCurrent: () => current }, {
    getPresentedNotificationsAsync: async () => { current = false; return [note('private', 'room-a')]; },
  });
  assert.deepEqual(out.calls, []);
});
test('room/session change during first dismissal stops subsequent removals', async () => {
  let current = true; const calls = [];
  await run([note('one', 'room-a'), note('two', 'room-a')], { isCurrent: () => current }, {
    dismissNotificationAsync: async (id) => { calls.push(id); current = false; },
  });
  assert.deepEqual(calls, ['one']);
});
test('OS errors never reject successful chat load; remaining notifications still attempted', async () => {
  const calls = [];
  const out = await run([note('failed', 'room-a'), note('ok', 'room-a')], {}, {
    dismissNotificationAsync: async (id) => { calls.push(id); if (id === 'failed') throw new Error('native'); },
  });
  assert.deepEqual(calls, ['failed', 'ok']); assert.equal(out.result.dismissed, 1);
});
test('OS enumeration failure is a safe no-op', async () => {
  assert.equal((await run([], {}, { getPresentedNotificationsAsync: async () => { throw new Error('native'); } })).result.dismissed, 0);
});

test('Android OS-rendered FCM notifications match encoded room tag without custom data', async () => {
  const foreign = (tag) => ({ date: 900, request: {
    identifier: 'expo-notifications://foreign_notifications?tag=' + encodeURIComponent(tag) + '&id=0',
    content: { data: { 'android.text': 'message' } }, trigger: null,
  } });
  const out = await run([foreign('chat:room-a'), foreign('chat:room-b'), foreign('FCM-Notification:random')]);
  assert.equal(out.calls.length, 1);
  assert.ok(out.calls[0].includes('chat%3Aroom-a'));
});
test('malformed foreign tags never match a room', async () => {
  const out = await run([{date: 900, request: {
    identifier: 'expo-notifications://foreign_notifications?tag=%ZZ&id=0', content: {data: {}},
  }}]);
  assert.deepEqual(out.calls, []);
});

const wrapped = (id, room, type = 'chat_message', encode = false, date = 900) => {
  const custom = { i: '2baf4778-511e-4a9d-a791-8b278c196e55', a: { room_id: room, type } };
  return { date, request: { identifier: id, content: { data: { custom: encode ? JSON.stringify(custom) : custom } } } };
};
test('OneSignal object and encoded payloads clear only older same-room chat', async () => {
  const out = await run([
    wrapped('ios-chat', 'room-a'), wrapped('android-doc', 'room-a', 'chat_attachment', true),
    wrapped('other-room', 'room-b'), wrapped('business', 'room-a', 'deal_accepted'),
    wrapped('new-push', 'room-a', 'chat_message', false, 1001),
  ]);
  assert.deepEqual(out.calls, ['ios-chat', 'android-doc']);
});
test('malformed or unmarked custom data cannot erase a presented notification', async () => {
  const list = ['{bad', { a: { room_id: 'room-a', type: 'chat_message' } },
    { i: 'not-a-uuid', a: { room_id: 'room-a', type: 'chat_message' } },
    { i: '2baf4778-511e-4a9d-a791-8b278c196e55', a: [] }].map((custom, index) =>
    ({ date: 900, request: { identifier: String(index), content: { data: { custom } } } }));
  assert.deepEqual((await run(list)).calls, []);
});
test('direct native room data has priority over a nested provider wrapper', async () => {
  const x = wrapped('conflicting', 'room-a');
  Object.assign(x.request.content.data, { room_id: 'room-b', type: 'chat_message' });
  assert.deepEqual((await run([x])).calls, []);
});
