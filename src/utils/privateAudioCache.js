export const PRIVATE_AUDIO_PREFIX = 'urtruck-private-chat-audio-';

const EXTENSIONS = {
  'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/mpeg': 'mp3',
  'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
};

export function sweepPrivateAudioEntries(entries, remove) {
  let removed = 0;
  for (const entry of entries || []) {
    const name = String(entry?.name || '');
    if (!name.startsWith(PRIVATE_AUDIO_PREFIX) || !/\.(m4a|webm|mp3|aac|ogg|wav)$/.test(name)) continue;
    if (remove(entry.uri)) removed += 1;
  }
  return removed;
}

export function stagePrivateAudio({ FileClass, cacheRoot, bytes, mime, nonce }) {
  const type = String(mime || '').split(';')[0].toLowerCase();
  const ext = EXTENSIONS[type];
  if (!ext) throw new Error('invalid_audio_type');
  const suffix = String(nonce || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!suffix) throw new Error('invalid_cache_nonce');
  const file = new FileClass(cacheRoot, `${PRIVATE_AUDIO_PREFIX}${suffix}.${ext}`);
  let created = false, disposed = false;
  const dispose = () => {
    if (disposed || !created) return;
    disposed = true;
    try { if (file.exists) file.delete(); } catch { /* удалить при следующем запуске */ }
  };
  try {
    file.create({ overwrite: false, intermediates: true });
    created = true;
    file.write(new Uint8Array(bytes));
    return { uri: file.uri, dispose };
  } catch (error) { dispose(); throw error; }
}
