// Canonical shape mappers for marketplace objects. The server returns
// snake_case (`from_city`, `truck_type`, `driver_name`), while older code paths
// pass camelCase or mixed shapes. Detail screens must not branch on every
// field — they consume the canonical shape and the empty-field fallback lives
// here in one place.

import { formatDateForDisplay } from './dateInput';

const pick = (...vals) => {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return null;
};

const PUBLIC_TRASH = /\s*\[ar-[a-z0-9]+\]\s*|\bcurrency-regression\b\s*|\bagent-[a-z0-9-]+\b\s*|\bDirect probe\b\s*/gi;
export const sanitizeForDisplay = (s) => {
  if (s === null || s === undefined) return s;
  const str = String(s);
  if (!str) return str;
  return str
    .replace(PUBLIC_TRASH, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export const CURRENCY_SYMBOLS = { USD: '$', KZT: '₸', RUB: '₽', CNY: '¥', UZS: 'сўм', KGS: 'сом' };

// Legacy data contains ISO codes, symbols and several textual aliases. Keep a
// single canonical ISO currency everywhere so list/detail/bid screens cannot
// disagree because one path received "₸" and another received "KZT".
const CURRENCY_ALIASES = {
  '$': 'USD', US$: 'USD', USD: 'USD', DOLLAR: 'USD', DOLLARS: 'USD',
  '₸': 'KZT', KZT: 'KZT', ТГ: 'KZT', ТЕНГЕ: 'KZT', TENGE: 'KZT',
  '₽': 'RUB', RUB: 'RUB', РУБ: 'RUB', РУБЛЬ: 'RUB', RUBLE: 'RUB',
  '¥': 'CNY', '￥': 'CNY', CNY: 'CNY', RMB: 'CNY', ЮАНЬ: 'CNY', YUAN: 'CNY',
  UZS: 'UZS', СУМ: 'UZS', SUM: 'UZS',
  KGS: 'KGS', СОМ: 'KGS', SOM: 'KGS',
};

export const normalizeCurrency = (currency, fallback = 'USD') => {
  const raw = String(currency || '').trim().toUpperCase();
  return CURRENCY_ALIASES[raw] || (CURRENCY_SYMBOLS[raw] ? raw : fallback);
};

export const formatPrice = (amount, currency, t) => {
  const cur = normalizeCurrency(currency);
  const sym = CURRENCY_SYMBOLS[cur];
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return t ? t('payment_negotiable') : 'По договорённости';
  }
  const n = String(Math.round(numeric)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return cur === 'UZS' || cur === 'KGS' ? `${n} ${sym}` : `${sym}${n}`;
};

export const normalizeTrip = (raw) => {
  if (!raw) return null;
  return {
    id: raw.id || raw.trip_id || null,
    from: pick(raw.from_city, raw.from, raw.fromCity, raw.from_point_name),
    to: pick(raw.to_city, raw.to, raw.toCity, raw.to_point_name),
    transit: pick(raw.transit, raw.transitCity, raw.transit_city),
    departure: pick(raw.departure, raw.departure_date, raw.departureDate),
    arrival: pick(raw.arrival, raw.arrival_date, raw.arrivalDate),
    truckType: pick(raw.truck_type, raw.truckType, raw.type),
    capacityTons: raw.capacity_tons ?? raw.capacityTons ?? raw.tons ?? null,
    availableM3: raw.available_m3 ?? raw.availableM3 ?? raw.m3 ?? raw.available_volume_m3 ?? null,
    price: raw.price ?? null,
    currency: normalizeCurrency(raw.currency),
    driverId: pick(raw.driver_id, raw.driverId),
    driverName: pick(raw.driver_name, raw.driverName, raw.name),
    driverPhone: pick(raw.driver_phone, raw.driverPhone, raw.phone),
    country: pick(raw.country, raw.driver_country),
    status: pick(raw.status, 'active'),
    createdAt: pick(raw.created_at, raw.createdAt),
    tripState: pick(raw.trip_state, raw.tripState, 'planned'),
    stateHistory: raw.state_history || raw.stateHistory || null,
    isTrip: true,
    _server: !!raw._server || !!raw.driver_id,
    isMine: !!raw.isMine,
  };
};

export const normalizeCargo = (raw) => {
  if (!raw) return null;
  const photosRaw = raw.photos || raw.photo || [];
  const photos = Array.isArray(photosRaw)
    ? photosRaw.filter((p) => typeof p === 'string' && p.length > 0)
    : (typeof photosRaw === 'string' && photosRaw.length > 0 ? [photosRaw] : []);
  return {
    id: raw.id || raw.cargo_id || null,
    from: pick(raw.from_city, raw.from, raw.fromCity),
    to: pick(raw.to_city, raw.to, raw.toCity),
    cargoDesc: pick(raw.cargo_desc, raw.cargoDesc, raw.cargo, raw.description),
    cargoType: pick(raw.cargo_type, raw.cargoType, raw.type),
    weightTons: raw.weight_tons ?? raw.weightTons ?? raw.tons ?? null,
    volumeM3: raw.volume_m3 ?? raw.volumeM3 ?? raw.m3 ?? null,
    price: raw.price ?? null,
    pickupDate: pick(raw.pickup_date, raw.pickupDate, raw.pickup),
    currency: normalizeCurrency(raw.currency),
    ownerId: pick(raw.owner_id, raw.ownerId),
    ownerName: pick(raw.owner_name, raw.ownerName, raw.name),
    ownerPhone: pick(raw.owner_phone, raw.ownerPhone, raw.phone),
    bidsCount: raw.bids_count ?? raw.bidsCount ?? raw.bids ?? 0,
    status: pick(raw.status, 'active'),
    createdAt: pick(raw.created_at, raw.createdAt),
    photos,
    isMine: !!raw.isMine,
    _server: !!raw._server || !!raw.owner_id,
  };
};

export const cargoDisplay = (cargo, t) => {
  const dash = (t && t('not_specified')) || 'Не указано';
  const typeLabel = cargo?.cargoType ? (t ? t(cargo.cargoType) : cargo.cargoType) : null;
  const weight = cargo?.weightTons > 0 ? `${cargo.weightTons} т` : dash;
  const volume = cargo?.volumeM3 > 0 ? `${cargo.volumeM3} м³` : dash;
  return {
    from: sanitizeForDisplay(cargo?.from) || dash,
    to: sanitizeForDisplay(cargo?.to) || dash,
    cargoDesc: sanitizeForDisplay(cargo?.cargoDesc) || dash,
    cargoType: typeLabel && typeLabel !== cargo?.cargoType ? typeLabel : (cargo?.cargoType || dash),
    weight,
    volume,
    price: formatPrice(cargo?.price, cargo?.currency, t),
    pickupDate: cargo?.pickupDate ? cargo.pickupDate : dash,
    ownerName: sanitizeForDisplay(cargo?.ownerName) || dash,
  };
};

export const tripDisplay = (trip, t) => {
  const dash = (t && t('not_specified')) || 'Не указано';
  const truck = trip?.truckType ? (t ? t(trip.truckType) : trip.truckType) : dash;
  return {
    from: sanitizeForDisplay(trip?.from) || dash,
    to: sanitizeForDisplay(trip?.to) || dash,
    transit: sanitizeForDisplay(trip?.transit) || '',
    departure: trip?.departure ? formatDateForDisplay(trip.departure) : dash,
    arrival: trip?.arrival ? formatDateForDisplay(trip.arrival) : dash,
    truckType: truck && truck !== trip?.truckType ? truck : (trip?.truckType || dash),
    capacityTons: trip?.capacityTons != null ? `${trip.capacityTons} т` : dash,
    availableM3: trip?.availableM3 != null ? `${trip.availableM3} м³` : dash,
    price: formatPrice(trip?.price, trip?.currency, t),
    driverName: sanitizeForDisplay(trip?.driverName) || dash,
  };
};
