// Decode an RFC 5987/URL-encoded display name once. This is presentation-only:
// callers must continue using the server-issued signed URL for file access.
export function displayAttachmentFilename(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/%[\da-f]{2}/i.test(raw)) return raw;
  try {
    const decoded = decodeURIComponent(raw).trim();
    if (!decoded || /[\u0000-\u001f\u007f]/.test(decoded)) return raw;
    return decoded;
  } catch {
    return raw;
  }
}
