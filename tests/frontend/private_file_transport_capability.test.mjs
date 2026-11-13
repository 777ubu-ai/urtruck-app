import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchPrivateFile } from '../../src/utils/privateFileTransport.js';

test('candidate requests authenticated private bytes and explicitly negotiates v1', async () => {
  let request;
  const result = await fetchPrivateFile({
    base: 'https://qa2.example/api/v1',
    kind: 'media', roomId: 'room-7', fileId: 'message-9',
    getToken: async () => 'test-session-token',
    extraHeaders: { 'X-UrTruck-Private-File-Transport': 'v1', 'X-UrTruck-Client-Version': '1.0.51' },
    fetcher: async (url, options) => {
      request = { url, options };
      return { ok: true, headers: { get: name => name === 'content-type' ? 'image/jpeg' : null }, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer };
    },
  });
  assert.equal(request.url, 'https://qa2.example/api/v1/chat/messages/room-7/media/message-9');
  assert.equal(request.options.headers.Authorization, 'Bearer test-session-token');
  assert.equal(request.options.headers['X-UrTruck-Private-File-Transport'], 'v1');
  assert.equal(result.mime, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(result.bytes)], [0xff, 0xd8, 0xff]);
});

test('chat metadata asks for the capability and renders private media without a bearer URL', () => {
  const api = readFileSync(new URL('../../src/utils/chatAPI.js', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
  assert.match(api, /X-UrTruck-Private-File-Transport': 'v1'/);
  assert.match(api, /X-UrTruck-Client-Version/);
  assert.match(screen, /message\.private_media_available/);
});
