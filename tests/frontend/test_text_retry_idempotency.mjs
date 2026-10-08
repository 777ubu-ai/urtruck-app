import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const body = source.split('const sendRawText = React.useCallback(async (body, retryId = null) => {')[1].split('}, [roomId, recipientId, deal?.cargo_id')[0];
test('uncertain response and manual retry reuse key and keep one bubble', async () => {
  let messages = [], sequence = 0, calls = [], first = true;
  const server = new Map();
  const env = { roomId: 'r', recipientId: 'other', newClientId: () => `key-${++sequence}`, nowTime: () => '',
    setMessages: fn => { messages = fn(messages); }, setAttachOpen() {}, setCallMenuOpen() {}, setEmojiOpen() {}, setShowJumpLatest() {}, nearBottomRef: { current: true }, setTimeout() {}, listRef: { current: null }, deal: {}, params: {}, session: { user: { id: 'u' } }, loadMessages() {}, setRoomId() {}, enqueueOutbox() {}, toast() {}, t: key => key,
    chatAPI: { send: async payload => { calls.push(payload.clientMsgId); server.set(payload.clientMsgId, payload.text); if (first) { first = false; throw new Error('response lost after server commit'); } return {}; } } };
  const send = new Function(...Object.keys(env), `return async function(body, retryId = null) { ${body} };`)(...Object.values(env));
  await send('hello'); assert.equal(messages[0].sendStatus, 'failed');
  const retryBody = source.split('const retryFailedText = React.useCallback((item) => {')[1].split('}, [sendRawText]')[0];
  const retry = new Function('sendRawText', `return function(item) { ${retryBody} };`)(send);
  await retry(messages[0]);
  assert.deepEqual(calls, ['key-1', 'key-1']); assert.equal(server.size, 1); assert.equal(messages.length, 1); assert.equal(sequence, 1);
  await send('second intentional message'); assert.deepEqual(calls, ['key-1', 'key-1', 'key-2']); assert.equal(messages.length, 2);
});
