function normalizedLocalPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURI(raw.replace(/^file:\/\//, '')).replace(/\/+$/, '');
  } catch {
    return raw.replace(/^file:\/\//, '').replace(/\/+$/, '');
  }
}

export const PRIVATE_PDF_CACHE_PREFIX = 'urtruck-private-pdf-';

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

export function sweepStalePrivatePdfCaches({ entries, excludePath, cacheUri, createFile }) {
  let deleted = 0;
  for (const entry of entries || []) {
    const name = String(entry?.name || '');
    const uri = String(entry?.uri || '');
    if (!name.startsWith(PRIVATE_PDF_CACHE_PREFIX) || !name.endsWith('.pdf')) continue;
    if (excludePath && normalizedLocalPath(uri) === normalizedLocalPath(excludePath)) continue;
    if (deletePrivatePdfCachePath(uri, { cacheUri, createFile })) deleted += 1;
  }
  return deleted;
}
