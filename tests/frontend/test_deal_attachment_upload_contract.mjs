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
  // isImage (not isDocument) drives the compress-vs-passthrough gate — an
  // XLSX/XLS/CSV picked via the shared document flow must never be routed
  // through compressImage(), so the check is "is this a photo", not
  // "is this specifically a recognized office document".
  assert.match(ui, /const uploadUri = isImage \? await compressImage\(uri, \{ preset: 'document' \}\) : uri/);
  assert.match(api, /endsWith\('\.xlsx'\)/);
  assert.match(api, /endsWith\('\.xls'\)/);
  assert.match(api, /endsWith\('\.csv'\)/);
  assert.match(backend, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(backend, /application\/vnd\.ms-excel/);
  assert.match(backend, /text\/csv/);
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
  // OLE2 (legacy .xls) and zip (xlsx) magic bytes, factored into named
  // constants (_OLE2_SIG/_ZIP_SIG) rather than inlined at each comparison
  // site — see test_deal_attachment_upload_contract.mjs's other tests below
  // for the constants' actual values and the xlsx/csv detection they drive.
  assert.match(backend, /_OLE2_SIG = b"\\xd0\\xcf\\x11\\xe0\\xa1\\xb1\\x1a\\xe1"/);
  assert.match(backend, /_ZIP_SIG = b"PK\\x03\\x04"/);
  assert.match(backend, /raw\[:8\] == _OLE2_SIG/);
  assert.match(backend, /raw\[:4\] != _ZIP_SIG/);
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

test('backend accepts XLSX/XLS/CSV documents, not only PDF/JPEG/PNG', () => {
  assert.match(backend, /_XLSX_MIME = "application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
  assert.match(backend, /_XLS_MIME = "application\/vnd\.ms-excel"/);
  assert.match(backend, /_CSV_MIME = "text\/csv"/);
  assert.match(backend, /_XLSX_MIME: \("document", "xlsx"\)/);
  assert.match(backend, /_XLS_MIME: \("document", "xls"\)/);
  assert.match(backend, /_CSV_MIME: \("document", "csv"\)/);
});

test('XLSX detection requires a real OOXML spreadsheet part, not just any PK zip signature', () => {
  // docx/pptx/plain .zip all share the same 4-byte PK\x03\x04 signature as
  // xlsx — a naive check would misclassify them. The sniff must additionally
  // look for content that only a real spreadsheet workbook has.
  assert.match(backend, /_looks_like_xlsx/);
  assert.match(backend, /xl\/workbook\.xml/);
  assert.match(backend, /\[Content_Types\]\.xml/);
});

test('legacy XLS is recognized by its real OLE2 signature', () => {
  assert.match(backend, /_OLE2_SIG = b"\\xd0\\xcf\\x11\\xe0\\xa1\\xb1\\x1a\\xe1"/);
});

test('CSV has no magic bytes — the sniff is honestly documented as text-shaped, not forged as certain', () => {
  assert.match(backend, /_looks_like_text/);
  assert.match(backend, /No CSV magic bytes exist/);
});

test('frontend document picker offers XLSX/XLS/CSV alongside PDF/images, for both chat surfaces', () => {
  assert.match(ui, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(ui, /application\/vnd\.ms-excel/);
  assert.match(ui, /text\/csv/);
});

test('document type classification is shared, not duplicated, between DealAttachments and the workspace chat', () => {
  assert.match(api, /export function documentKindFromFile/);
  assert.match(ui, /documentKindFromFile/);
  const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
  assert.match(workspace, /documentKindFromFile/);
});
