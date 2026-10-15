// Pure preparation orchestration; dependencies are injected for device-free
// tests. Strict compression guarantees JPEG; office documents never call it.
export const CHAT_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export async function prepareChatPhoto(
  { uri, name = 'photo.jpg', preset = 'chat' },
  { compressImage, readByteSize },
) {
  let output;
  let size;
  try {
    output = await compressImage(uri, { preset, strict: true });
    size = await readByteSize(output);
    if (!output || !Number.isFinite(size) || size <= 0) throw new Error('photo_size_unavailable');
  } catch (cause) {
    const error = new Error('photo_preparation_failed', { cause });
    error.code = 'photo_preparation_failed';
    throw error;
  }
  if (size > CHAT_PHOTO_MAX_BYTES) {
    const error = new Error('photo_too_large');
    error.code = 'photo_too_large';
    error.status = 413;
    throw error;
  }
  const basename = String(name).split(/[\\/]/).pop().replace(/\.[^.]*$/, '') || 'photo';
  return { uri: output, name: `${basename}.jpg`, type: 'image/jpeg', size };
}
