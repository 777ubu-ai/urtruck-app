const DOCUMENT_MIME_BY_EXTENSION = Object.freeze({
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
});

const MAX_PRIVATE_ATTACHMENT_BYTES = 12 * 1024 * 1024;

function safeName(value) {
  const name = String(value || 'document').replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 180);
  return name || 'document';
}

function documentMime(name, serverMime) {
  const extension = safeName(name).split('.').pop().toLowerCase();
  const expected = DOCUMENT_MIME_BY_EXTENSION[extension];
  const received = String(serverMime || '').split(';')[0].trim().toLowerCase();
  if (!expected) throw new Error('unsupported_private_document');
  if (received === expected || received === 'application/octet-stream') return expected;
  throw new Error('private_document_type_mismatch');
}

export async function openPrivateAttachment({
  roomId,
  fileId,
  name,
  platform,
  getPrivateFile,
  createTempFile,
  openWithViewer,
}) {
  if (!roomId || !fileId || typeof getPrivateFile !== 'function'
    || typeof createTempFile !== 'function' || typeof openWithViewer !== 'function') {
    throw new Error('private_document_context_missing');
  }
  if (!['android', 'ios'].includes(String(platform).toLowerCase())) {
    throw new Error('native_document_viewer_unavailable');
  }

  const { bytes, mime } = await getPrivateFile(roomId, fileId);
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
    throw new Error('private_file_invalid');
  }
  const byteLength = bytes.byteLength;
  if (byteLength === 0) throw new Error('private_file_empty');
  if (byteLength > MAX_PRIVATE_ATTACHMENT_BYTES) throw new Error('private_file_too_large');
  const resolvedMime = documentMime(name, mime);
  const filename = safeName(name);
  const view = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const staged = await createTempFile(filename, view);
  if (!staged?.path) throw new Error('private_document_stage_failed');
  await openWithViewer(String(platform).toLowerCase(), staged.path, resolvedMime);
  return { path: staged.path, mime: resolvedMime, filename };
}
