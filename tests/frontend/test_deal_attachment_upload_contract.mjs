import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/utils/chatAPI.js', 'utf8');
const ui = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const backend = fs.readFileSync('backend/api/deal_room.py', 'utf8');
const storage = fs.readFileSync('backend/services/storage_service.py', 'utf8');

test('Safari/PWA PDF is rewrapped with the intended MIME before multipart upload', () => {
  assert.match(api, /new File\(\[blob\], name, \{ type: finalType/);
  assert.match(api, /mimeFromName\(name\)/);
  assert.match(api, /application\/pdf/);
  assert.match(api, /form\.append\('file', part, name\)/);
  assert.match(api, /fileObject instanceof Blob/);
  assert.match(ui, /fileObject: file\.file \|\| null/);
});

test('deal document picker uploads office files as files, not compressed images', () => {
  assert.match(ui, /application\/vnd\.ms-excel/);
  assert.match(ui, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(ui, /text\/csv/);
  assert.match(ui, /isOfficeDocument/);
  assert.match(ui, /const uploadUri = isDocument \? uri : await compressImage/);
  assert.match(api, /endsWith\('\.xlsx'\)/);
  assert.match(api, /endsWith\('\.xls'\)/);
  assert.match(api, /endsWith\('\.csv'\)/);
  assert.match(backend, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(backend, /application\/vnd\.ms-excel/);
  assert.match(backend, /text\/csv/);
});

test('attachment retry uses one stable client upload id and backend deduplicates it', () => {
  assert.match(ui, /clientUploadId: localId/);
  assert.match(ui, /const retryItem = \{ \.\.\.item, status: 'retrying'/);
  assert.match(api, /form\.append\('client_upload_id', String\(clientUploadId\)\)/);
  assert.match(backend, /_reserve_attachment/);
  assert.match(backend, /INSERT OR IGNORE INTO message_attachments/);
  assert.match(backend, /client_upload_id/);
});

test('backend trusts magic bytes over generic browser MIME but rejects specific contradictions', () => {
  assert.match(backend, /application\/octet-stream/);
  assert.match(backend, /if raw\[:5\] == b"%PDF-"/);
  assert.match(backend, /declared not in _GENERIC_DECLARED_MIME and declared != sniffed/);
  assert.match(backend, /status_code=415/);
});

test('private storage preserves the real attachment MIME instead of hardcoding JPEG', () => {
  assert.match(storage, /def save_file\(/);
  assert.match(storage, /"Content-Type": content_type or "application\/octet-stream"/);
  assert.match(backend, /content_type=mime/);
});

test('HTTP attachment failures are not mislabeled as a network failure', () => {
  assert.match(api, /error\.status = status/);
  assert.match(api, /error\.isNetwork = Boolean\(isNetwork\)/);
  assert.match(api, /if \(!response\.ok\)/);
  assert.match(api, /throw attachmentError\(detail, \{ status: response\.status, detail \}\)/);
});
