const STAGING_PREFIX = 'urtruck-upload-';
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function safeNativeUploadName(name) {
  const cleaned = String(name || 'file.bin')
    .normalize('NFC')
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .trim();
  return cleaned || 'file.bin';
}

export function sweepStaleNativeUploads({ Directory, cacheRoot, now = Date.now() }) {
  try {
    const cache = new Directory(cacheRoot);
    if (!cache.exists) return;
    for (const entry of cache.list()) {
      if (!entry?.name?.startsWith(STAGING_PREFIX)) continue;
      const info = entry.info?.() || {};
      const modified = Number(info.modificationTime || info.creationTime || 0);
      if (modified > 0 && now - modified > STAGING_MAX_AGE_MS) {
        try { entry.delete(); } catch {}
      }
    }
  } catch {}
}

export async function withNativeUploadFile(
  form,
  uri,
  name,
  send,
  { Directory, File, cacheRoot, now = Date.now(), random = Math.random },
) {
  sweepStaleNativeUploads({ Directory, cacheRoot, now });
  const uploadDirectory = new Directory(
    cacheRoot,
    `${STAGING_PREFIX}${now}-${random().toString(16).slice(2)}`,
  );
  uploadDirectory.create({ idempotent: true, intermediates: true });
  const source = new File(uri);
  const staged = new File(uploadDirectory, safeNativeUploadName(name));
  try {
    await source.copy(staged);
    form.append('file', staged, staged.name);
    return await send();
  } finally {
    try { uploadDirectory.delete(); } catch {}
  }
}
