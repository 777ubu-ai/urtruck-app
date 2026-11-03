// SQLite-время без зоны трактуется как UTC, как и на сервере.
function timestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
}
export function isListingExpired(item, now = Date.now()) {
  const published = timestamp(item.published_at);
  const start = Number.isFinite(published) ? published : timestamp(item.created_at);
  return Number.isFinite(start) && now >= start + 30 * 24 * 60 * 60 * 1000;
}
