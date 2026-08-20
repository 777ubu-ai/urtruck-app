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
});

test('deal document picker and backend support PDF plus Excel/CSV attachments', () => {
  for (const mime of [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ]) {
    assert.match(api, new RegExp(mime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(ui, new RegExp(mime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(backend, new RegExp(mime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(backend, /raw\[:8\] == b"\\xd0\\xcf\\x11\\xe0\\xa1\\xb1\\x1a\\xe1"/);
  assert.match(backend, /raw\[:4\] == b"PK\\x03\\x04"/);
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

test('chat images open in a fullscreen viewer from both deal workspaces', () => {
  const v1 = fs.readFileSync('src/screens/DealWorkspaceScreen.js', 'utf8');
  const v2 = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  for (const src of [v1, v2]) {
    assert.match(src, /testID="deal-chat-image-open"/);
    assert.match(src, /testID="deal-chat-image-viewer"/);
    assert.match(src, /resizeMode="contain"/);
    assert.match(src, /setImagePreview/);
  }
});
