function normalizedLocalPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURI(raw.replace(/^file:\/\//, '')).replace(/\/+$/, '');
  } catch {
    return raw.replace(/^file:\/\//, '').replace(/\/+$/, '');
  }
}

export function isPrivatePdfCachePath(path, cacheUri) {
  const candidate = normalizedLocalPath(path);
  const cacheRoot = normalizedLocalPath(cacheUri);
  return Boolean(candidate && cacheRoot && candidate.startsWith(`${cacheRoot}/`));
}

export function deletePrivatePdfCachePath(path, { cacheUri, createFile }) {
  if (!isPrivatePdfCachePath(path, cacheUri)) return false;
  try {
    const file = createFile(path);
    if (file.exists) file.delete();
    return true;
  } catch {
    return false;
  }
}
