import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPrivateFile, privateFilePath } from '../../src/utils/privateFileTransport.js';

const response = (bytes = new Uint8Array([37, 80, 68, 70]).buffer) => ({
  ok: true, headers: { get: (name) => name === 'content-type' ? 'application/pdf' : null },
  arrayBuffer: async () => bytes,
});

test('идентификаторы кодируются, токен остаётся в заголовке', async () => {
  let request;
  const result = await fetchPrivateFile({ base: 'https://example.test/api/v1', kind: 'attachment', roomId: 'room/one', fileId: 'id?x',
    getToken: async () => 'secret-token', fetcher: async (url, options) => { request = { url, options }; return response(); } });
  assert.equal(request.url, 'https://example.test/api/v1/chat/conversations/room%2Fone/attachments/id%3Fx/content');
  assert.equal(request.options.headers.Authorization, 'Bearer secret-token');
  assert.ok(!request.url.includes('secret-token'));
  assert.equal(result.bytes.byteLength, 4);
});

test('смена сессии, отказ и отмена не возвращают содержимое', async () => {
  let count = 0;
  const args = { base: '', kind: 'media', roomId: 'r', fileId: 1,
    getToken: async () => ++count === 1 ? 'old' : 'new', fetcher: async () => response() };
  await assert.rejects(fetchPrivateFile(args), /session_changed/);
  await assert.rejects(fetchPrivateFile({ ...args, getToken: async () => 'x', fetcher: async () => ({ ok: false, status: 403 }) }), /private_file_request_failed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchPrivateFile({ ...args, getToken: async () => 'x', signal: controller.signal }), /request_cancelled/);
});

test('пустые и недопустимые ID отклоняются, размер ограничен', async () => {
  assert.throws(() => privateFilePath('media', '', 1), /invalid_file_id/);
  assert.throws(() => privateFilePath('media', '..', 1), /invalid_file_id/);
  assert.throws(() => privateFilePath('wrong', 'r', 1), /invalid_file_kind/);
  await assert.rejects(fetchPrivateFile({ base: '', kind: 'media', roomId: 'r', fileId: 1,
    getToken: async () => 'x', fetcher: async () => response(new ArrayBuffer(12 * 1024 * 1024 + 1)) }), /private_file_too_large/);
});

test('таймаут ограничивает транспорт, который не реагирует на отмену', async () => {
  await assert.rejects(fetchPrivateFile({ base: '', kind: 'media', roomId: 'r', fileId: 1,
    getToken: async () => 'x', fetcher: () => new Promise(() => {}), timeoutMs: 5 }), /private_file_timeout/);
});

test('отмена прерывает ожидание даже при зависшем транспорте', async () => {
  const controller = new AbortController();
  const result = fetchPrivateFile({ base: '', kind: 'media', roomId: 'r', fileId: 1,
    getToken: async () => 'x', fetcher: () => new Promise(() => {}), signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(result, /request_cancelled/);
});
