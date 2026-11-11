export const PRIVATE_IMAGE_PREFIX = 'urtruck-private-chat-image-';

export function sweepPrivateImageEntries(entries, remove) {
  let removed = 0;
  for (const entry of entries || []) {
    const name = String(entry?.name || '');
    if (!name.startsWith(PRIVATE_IMAGE_PREFIX) || !/\.(jpg|png)$/.test(name)) continue;
    if (remove(entry.uri)) removed += 1;
  }
  return removed;
}

export function stagePrivateImage({ FileClass, cacheRoot, bytes, mime, nonce }) {
  const type = String(mime || '').split(';')[0].toLowerCase();
  const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : '';
  if (!ext) throw new Error('invalid_image_type');
  const suffix = String(nonce || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!suffix) throw new Error('invalid_cache_nonce');
  const file = new FileClass(cacheRoot, `${PRIVATE_IMAGE_PREFIX}${suffix}.${ext}`);
  let created = false;
  let disposed = false;
  const dispose = () => {
    if (disposed || !created) return;
    disposed = true;
    try { if (file.exists) file.delete(); } catch { /* кэш останется для очистки при следующем запуске */ }
  };
  try {
    file.create({ overwrite: false, intermediates: true });
    created = true;
    file.write(new Uint8Array(bytes));
    return { uri: file.uri, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
