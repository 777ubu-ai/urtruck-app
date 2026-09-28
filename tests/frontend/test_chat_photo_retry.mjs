import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const body = source.split('const uploadPhoto = React.useCallback(async (item) => {')[1]
  .split('}, [roomId, recipientId, deal?.cargo_id, deal?.trip_id, params.cargoId, params.tripId, loadMessages, t]);')[0];

function harness(api) {
  const state = { messages: [{ id: 'photo-1', photo: true, mediaUrl: 'file://test.jpg', optimistic: true }] };
  const env = {
    chatAPI: api, roomId: 'room', recipientId: 'recipient', deal: {}, params: {},
    photoSendingRef: { current: new Set() }, loadMessages() {}, setTimeout() {}, t: (key) => key,
    setMessages: (fn) => { state.messages = fn(state.messages); },
  };
  const upload = new Function(...Object.keys(env), `return async function(item) { ${body} };`)(...Object.values(env));
  return { state, upload };
}

test('после ошибки доставки повтор фото использует сохранённый файл и тот же id', async () => {
  let uploads = 0, attempts = [];
  const h = harness({
    uploadChatPhoto: async () => { uploads++; return { photo_key: 'private-photo' }; },
    send: async (message) => { attempts.push(message); if (attempts.length === 1) throw new Error('timeout'); },
  });
  await h.upload(h.state.messages[0]);
  assert.equal(h.state.messages[0].sendStatus, 'failed');
  assert.equal(h.state.messages[0].photoKey, 'private-photo');
  await h.upload(h.state.messages[0]);
  assert.equal(uploads, 1);
  assert.equal(h.state.messages[0].sendStatus, 'sent');
  assert.deepEqual(attempts[0], attempts[1]);
});

test('двойной тап не запускает две загрузки, ошибка сохраняет фото для повтора', async () => {
  let reject, uploads = 0;
  const h = harness({
    uploadChatPhoto: () => { uploads++; return new Promise((_, r) => { reject = r; }); },
    send: async () => assert.fail('Нельзя отправлять без загруженного файла'),
  });
  const first = h.upload(h.state.messages[0]);
  await h.upload(h.state.messages[0]);
  assert.equal(uploads, 1);
  reject(Object.assign(new Error('offline'), { isNetwork: true }));
  await first;
  assert.equal(h.state.messages[0].sendStatus, 'failed');
  assert.equal(h.state.messages[0].sendError, 'no_connection');
  assert.equal(h.state.messages[0].mediaUrl, 'file://test.jpg');
});
