// geoCatalog — ЕДИНЫЙ нормализованный справочник стран и локаций.
//
// §5 ТЗ Task 3: «Использовать существующую архитектуру, если она уже
// нормализована, а не создавать второй параллельный справочник». Источник
// истины — shared/geo-catalog.json, тот же файл читает backend
// (backend/services/geo_catalog.py). Один JSON → два консьюмера → справочники
// не могут разъехаться.
//
// Модель (§4/§5):
//   COUNTRY               → country_id = 'CN', location_id = null  («Весь Китай»)
//   COUNTRY + LOCATION    → country_id = 'CN', location_id = 'cn-yiwu'
//
// «Весь Китай» — это НЕ fake city. Это scope фильтра: location_id === null.
//
// location_type: CITY | BORDER_CROSSING | LOGISTICS_HUB (§5, §9).
//
// Локализация (§8): один entity id → разные display names. names.ru всегда
// есть; ZH/KK — там, где существует общепринятое написание. Языки НЕ
// смешиваются: resolver отдаёт запрошенный язык, иначе честный fallback
// ru → en, а не транслит на ходу.
//
// ВАЖНО (integration dependency, §1 ТЗ): этот модуль СПЕЦИАЛЬНО не трогает
// src/utils/places.js и src/utils/i18n.js — они общие с Chat/Voice, над
// которыми параллельно работает другой агент.

import catalog from './geoCatalogData';

export const LOCATION_TYPES = {
  CITY: 'CITY',
  BORDER_CROSSING: 'BORDER_CROSSING',
  LOGISTICS_HUB: 'LOGISTICS_HUB',
};

const SUPPORTED_LANGS = ['ru', 'en', 'zh', 'kk'];

export const COUNTRIES = catalog.countries;
export const LOCATIONS = catalog.locations;

const COUNTRY_BY_ID = new Map(COUNTRIES.map((c) => [c.id, c]));
const LOCATION_BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

const LOCATIONS_BY_COUNTRY = (() => {
  const m = new Map();
  for (const l of LOCATIONS) {
    if (!m.has(l.country_id)) m.set(l.country_id, []);
    m.get(l.country_id).push(l);
  }
  // Внутри страны: города → КПП → хабы, внутри группы по алфавиту RU.
  const rank = { CITY: 0, BORDER_CROSSING: 1, LOGISTICS_HUB: 2 };
  for (const list of m.values()) {
    list.sort((a, b) => (rank[a.type] - rank[b.type])
      || a.names.ru.localeCompare(b.names.ru, 'ru'));
  }
  return m;
})();

export const getCountry = (countryId) => COUNTRY_BY_ID.get(String(countryId || '').toUpperCase()) || null;
export const getLocation = (locationId) => LOCATION_BY_ID.get(String(locationId || '')) || null;

/** Нормализация языка: 'ZH', 'zh-CN', 'zh_Hans' → 'zh'. Неизвестный → 'ru'. */
export const normalizeLang = (lang) => {
  const raw = String(lang || '').toLowerCase().replace('_', '-').split('-')[0];
  return SUPPORTED_LANGS.includes(raw) ? raw : 'ru';
};

/** §8: display name сущности в конкретной локали. Языки не смешиваются. */
export const localizedName = (entity, lang) => {
  if (!entity || !entity.names) return '';
  const l = normalizeLang(lang);
  return entity.names[l] || entity.names.ru || entity.names.en || '';
};

export const countryName = (countryId, lang) => localizedName(getCountry(countryId), lang);
export const locationName = (locationId, lang) => localizedName(getLocation(locationId), lang);

/** Локации страны, опционально отфильтрованные по типу. */
export const locationsForCountry = (countryId, type = null) => {
  const list = LOCATIONS_BY_COUNTRY.get(String(countryId || '').toUpperCase()) || [];
  return type ? list.filter((l) => l.type === type) : list;
};

/** §21-контракт на клиенте: локация действительно принадлежит стране. */
export const isLocationInCountry = (countryId, locationId) => {
  if (!locationId) return true;              // whole-country scope — валиден
  const loc = getLocation(locationId);
  if (!loc) return false;
  return loc.country_id === String(countryId || '').toUpperCase();
};

/**
 * Каноническая точка маршрутного фильтра.
 * locationId === null → WHOLE COUNTRY (§4).
 */
export const makeRoutePoint = (countryId, locationId = null) => {
  const country = getCountry(countryId);
  if (!country) return null;
  if (locationId && !isLocationInCountry(country.id, locationId)) return null;
  return { countryId: country.id, locationId: locationId || null };
};

export const isWholeCountry = (point) => !!point && !point.locationId;

/**
 * §4/§9: подпись точки для UI.
 *   whole country     → «Весь Китай» / «Весь Казахстан»
 *   city              → «Иу»
 *   border crossing   → «Нур Жолы · КПП»
 *   logistics hub     → «Малашевичи (терминал) · Хаб»
 * Суффиксы приходят через `labels`, чтобы модуль не зависел от i18n.js
 * (integration dependency §1).
 */
export const DEFAULT_SCOPE_LABELS = {
  ru: { whole: 'Весь', wholeF: 'Вся', border: 'КПП', hub: 'Хаб' },
  en: { whole: 'All of', wholeF: 'All of', border: 'Border', hub: 'Hub' },
  zh: { whole: '全', wholeF: '全', border: '口岸', hub: '枢纽' },
  kk: { whole: 'Бүкіл', wholeF: 'Бүкіл', border: 'ӨБ', hub: 'Хаб' },
};

// Русский требует согласования рода: «Весь Китай», но «Вся Германия».
// Список женского рода держим данными, а не эвристикой по последней букве —
// «Венгрия» женского рода, а «Кыргызстан» мужского при той же -я/-н логике
// ошибок не даёт, но «Чехия»/«Австрия» ломали бы любое правило по суффиксу
// без исключений. Здесь — явный набор.
const RU_FEMININE_COUNTRIES = new Set([
  'DE', 'NL', 'BE', 'FR', 'IT', 'ES', 'CZ', 'AT', 'HU', 'SK', 'SI',
  'PL', 'LT', 'LV', 'EE', 'FI', 'DK', 'SE', 'RO', 'BG', 'GR', 'TR',
  'RU', 'AM', 'GE',
]);
// Нидерланды — множественное число: «Все Нидерланды».
const RU_PLURAL_COUNTRIES = new Set(['NL']);

export const wholeCountryLabel = (countryId, lang, labels = DEFAULT_SCOPE_LABELS) => {
  const l = normalizeLang(lang);
  const country = getCountry(countryId);
  if (!country) return '';
  const name = localizedName(country, l);
  const dict = labels[l] || labels.ru;
  if (l === 'zh') return `${dict.whole}${name}`;      // 全中国
  if (l !== 'ru') return `${dict.whole} ${name}`;
  if (RU_PLURAL_COUNTRIES.has(country.id)) return `Все ${name}`;
  return `${RU_FEMININE_COUNTRIES.has(country.id) ? dict.wholeF : dict.whole} ${name}`;
};

export const routePointLabel = (point, lang, labels = DEFAULT_SCOPE_LABELS) => {
  if (!point || !point.countryId) return '';
  const l = normalizeLang(lang);
  if (isWholeCountry(point)) return wholeCountryLabel(point.countryId, l, labels);
  const loc = getLocation(point.locationId);
  if (!loc) return wholeCountryLabel(point.countryId, l, labels);
  const dict = labels[l] || labels.ru;
  const name = localizedName(loc, l);
  if (loc.type === LOCATION_TYPES.BORDER_CROSSING) return `${name} · ${dict.border}`;
  if (loc.type === LOCATION_TYPES.LOGISTICS_HUB) return `${name} · ${dict.hub}`;
  return name;
};

export const countryFlag = (countryId) => getCountry(countryId)?.flag || '';

// ── Поиск (§6) ─────────────────────────────────────────────────────────────
// Ищет по странам, городам, погранпереходам, хабам, локализованным
// названиям и aliases. Индекс строится один раз при импорте модуля —
// на 10 000+ объявлений поиск не должен линейно перебирать каталог заново
// на каждое нажатие клавиши.

const fold = (s) => String(s || '').toLowerCase().replace('ё', 'е').trim();

const SEARCH_INDEX = (() => {
  const rows = [];
  for (const c of COUNTRIES) {
    rows.push({
      kind: 'country',
      countryId: c.id,
      locationId: null,
      terms: [...SUPPORTED_LANGS.map((l) => c.names[l]), c.id].filter(Boolean).map(fold),
    });
  }
  for (const l of LOCATIONS) {
    const country = getCountry(l.country_id);
    rows.push({
      kind: 'location',
      countryId: l.country_id,
      locationId: l.id,
      type: l.type,
      terms: [
        ...SUPPORTED_LANGS.map((lang) => l.names[lang]),
        ...(l.aliases || []),
        l.partner_name,
        country ? country.names.ru : null,
      ].filter(Boolean).map(fold),
    });
  }
  return rows;
})();

/**
 * §6: «Город, страна или погранпереход» — один вход, все сущности.
 * Возвращает список { kind, countryId, locationId, type }.
 * Порядок: точное совпадение → начинается с запроса → содержит.
 * Страны идут перед локациями при равном ранге, чтобы «Китай» давал сначала
 * «Весь Китай», а не случайный китайский город.
 */
export const searchGeo = (query, { limit = 20, countryId = null, type = null } = {}) => {
  let pool = SEARCH_INDEX;
  if (countryId) {
    const cid = String(countryId).toUpperCase();
    pool = pool.filter((r) => r.countryId === cid);
  }
  if (type) pool = pool.filter((r) => r.kind === 'location' && r.type === type);

  const q = fold(query);
  if (!q) return pool.filter((r) => r.kind === 'country').slice(0, limit);

  const scored = [];
  for (const r of pool) {
    let best = 99;
    for (const t of r.terms) {
      if (t === q) { best = 0; break; }
      if (t.startsWith(q)) { best = Math.min(best, 1); continue; }
      if (t.includes(q)) best = Math.min(best, 2);
    }
    if (best < 99) scored.push({ row: r, score: best });
  }
  scored.sort((a, b) => a.score - b.score
    || (a.row.kind === b.row.kind ? 0 : a.row.kind === 'country' ? -1 : 1)
    || a.row.terms[0].localeCompare(b.row.terms[0], 'ru'));
  return scored.slice(0, limit).map((s) => {
    const { terms, ...rest } = s.row;
    return rest;
  });
};

/** Query-параметры для backend (§15). null-локация = whole country. */
export const routeFilterParams = (origin, destination) => {
  const params = {};
  if (origin?.countryId) {
    params.origin_country_id = origin.countryId;
    if (origin.locationId) params.origin_location_id = origin.locationId;
  }
  if (destination?.countryId) {
    params.destination_country_id = destination.countryId;
    if (destination.locationId) params.destination_location_id = destination.locationId;
  }
  return params;
};
