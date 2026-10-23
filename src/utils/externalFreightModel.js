/** Чистая логика для внешней ленты, общая для мобильного экрана и unit-проверок. */
export function dayStart(value, end = false) {
  if (!value) return undefined;
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const parsed = dmy ? new Date(+dmy[3], +dmy[2] - 1, +dmy[1]) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (end) parsed.setHours(23, 59, 59, 999);
  else parsed.setHours(0, 0, 0, 0);
  return parsed.toISOString();
}

export function appendUnique(current, incoming) {
  const seen = new Set(current.map(item => item.id));
  return [...current, ...incoming.filter(item => !seen.has(item.id) && seen.add(item.id))];
}

export function buildExternalFeedQuery(filters = {}, { cursor, limit = 30, reset = false } = {}) {
  const query = {
    ...filters,
    published_from: dayStart(filters.published_from),
    published_to: dayStart(filters.published_to, true),
    min_price: filters.min_price === '' || filters.min_price == null ? undefined : Number(String(filters.min_price).replace(',', '.')),
    max_price: filters.max_price === '' || filters.max_price == null ? undefined : Number(String(filters.max_price).replace(',', '.')),
    cursor: reset ? undefined : cursor || undefined,
    limit: Math.min(100, Math.max(1, Number(limit) || 30)),
  };
  Object.keys(query).forEach(key => (query[key] === undefined || query[key] === '') && delete query[key]);
  return query;
}

export function externalLocationSelection(key, value, point) {
  const country = point?.country && point.country !== 'XX' ? point.country : '';
  const countryOnly = point?.countryOnly || point?.type === 'country';
  const city = countryOnly ? '' : point?.name || (typeof value === 'string' ? value : value?.city || '');
  return { [key]: city, [`${key}_country`]: country };
}

/** Прямой ввод для внешней ленты: без сканирования городского справочника. */
export function externalLocationTextSelection(key, value, countries = []) {
  if (key !== 'origin' && key !== 'destination') throw new Error('invalid_location_key');
  const text = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const query = text.toLocaleLowerCase();
  const country = query ? countries.find(item => [item.iso, item.name, ...Object.values(item.names || {})]
    .some(name => String(name || '').toLocaleLowerCase() === query)) : null;
  return { [key]: country ? '' : text, [`${key}_country`]: country?.iso || '' };
}

export function feedKindForRole(role) {
  if (role === 'driver') return 'cargo';
  if (role === 'client' || role === 'shipper') return 'vehicle';
  return null;
}

export function canSortPrice({ price_currencies = [] } = {}) {
  return new Set(price_currencies.map(value => String(value || '').trim().toUpperCase()).filter(Boolean)).size === 1;
}

export function isValidPublicationRange({ published_from, published_to }) {
  if (!published_from || !published_to) return true;
  const from = dayStart(published_from);
  const to = dayStart(published_to, true);
  return Boolean(from && to && from <= to);
}

/** Новый снимок головы: обновляет карточки, сохраняет уже загруженный хвост. */
export function mergeLiveFeed(current, incoming, { sort = 'newest', now = Date.now(), hasMore = true, savedOnly = false } = {}) {
  if (savedOnly) return incoming;
  const visible = item => item.status !== 'closed' && item.status !== 'hidden'
    && item.status !== 'expired' && (!item.expires_at || Date.parse(item.expires_at) > now);
  const fresh = incoming.filter(visible);
  const ids = new Set(incoming.map(item => item.id));
  const last = incoming[incoming.length - 1];
  const boundary = last ? Date.parse(last.source_published_at) : null;
  const tail = current.filter(item => visible(item) && !ids.has(item.id)
    && hasMore && sort === 'newest'
    && (item.kind === 'carrier_contact'
      ? (last?.kind !== 'carrier_contact' || item.directory_sequence > last.directory_sequence)
      : (last?.kind !== 'carrier_contact' && boundary != null
        && (Date.parse(item.source_published_at) < boundary
          || (Date.parse(item.source_published_at) === boundary && String(item.id) < String(last.id))))));
  return [...fresh, ...tail];
}

/** Только ссылка на исходный пост; не личный контакт автора. */
export function externalTelegramPost(item) {
  const message = String(item?.source_message_id || '');
  const source = String(item?.origin_source || '').replace(/^@/, '');
  if (!/^\d+$/.test(message)) return null;
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(source)) return `https://t.me/${source}/${message}`;
  return null;
}
