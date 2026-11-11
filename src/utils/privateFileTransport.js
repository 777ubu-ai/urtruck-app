// Приватные файлы запрашиваются только по серверным ID и текущей сессии.
const MAX_PRIVATE_BYTES = 12 * 1024 * 1024;

function segment(value) {
  const text = String(value ?? '');
  if (!text || text === '.' || text === '..' || text.length > 256 || /[\u0000-\u001f]/.test(text)) throw new Error('invalid_file_id');
  return encodeURIComponent(text);
}

export function privateFilePath(kind, roomId, fileId) {
  const room = segment(roomId);
  const file = segment(fileId);
  if (kind === 'attachment') return `/chat/conversations/${room}/attachments/${file}/content`;
  if (kind === 'media') return `/chat/messages/${room}/media/${file}`;
  throw new Error('invalid_file_kind');
}

export async function fetchPrivateFile({ base, kind, roomId, fileId, getToken, fetcher, signal, timeoutMs = 20000 }) {
  const path = privateFilePath(kind, roomId, fileId);
  const token = await getToken();
  if (!token) throw new Error('auth_required');
  if (signal?.aborted) throw new Error('request_cancelled');
  const controller = new AbortController();
  let rejectCancellation;
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  const cancel = () => { controller.abort(); rejectCancellation(new Error('request_cancelled')); };
  signal?.addEventListener('abort', cancel, { once: true });
  let timer;
  try {
    const work = (async () => {
      const response = await fetcher(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
      });
      if (!response.ok) {
        const error = new Error('private_file_request_failed');
        error.status = response.status;
        throw error;
      }
      const length = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(length) && length > MAX_PRIVATE_BYTES) throw new Error('private_file_too_large');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_PRIVATE_BYTES) throw new Error('private_file_too_large');
      if (controller.signal.aborted || await getToken() !== token) throw new Error('session_changed');
      return { bytes, mime: response.headers?.get?.('content-type') || 'application/octet-stream' };
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('private_file_timeout')); }, timeoutMs);
    });
    return await Promise.race([work, timeout, cancelled]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
