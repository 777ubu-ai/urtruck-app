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

// Stage 9: scrub QA / debug / development markers from any user-visible
// string before it lands on a card or detail screen. The QA agents
// tag every record they create with a run-id token like `[ar-rmoxxxx]`
// and sometimes prefix descriptions with the test name itself
// (`currency-regression …`, `Direct probe …`, `agent-boris …`). These
// strings are useful for QA correlation but should never reach a
// real user.
//
// Backend keeps the tags in cargo_desc / from_city / to_city so the
// QA cleanup script can find and delete the records. Frontend strips
// them for display only.
//
// The regex is conservative — it only deletes the markers themselves
// and collapses the resulting double spaces. Adjacent meaningful text
// stays intact.
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

// Currency utilities. The server stores `currency` as ISO code; UI shows
// a symbol next to the price. Default to USD when missing — matches DB
// migration (ALTER TABLE … ADD COLUMN currency TEXT DEFAULT 'USD').
export const CURRENCY_SYMBOLS = { USD: '$', KZT: '₸', RUB: '₽', CNY: '¥', UZS: 'сўм' };

export const formatPrice = (amount, currency, t) => {
  const cur = (currency || 'USD').toUpperCase();
  const sym = CURRENCY_SYMBOLS[cur] || '$';
  if (!amount || Number(amount) <= 0) {
    return t ? t('payment_negotiable') : 'По договорённости';
  }
  // Group thousands without using Intl (web safari quirks).
  const n = String(Math.round(Number(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  // Symbol prefix for $/₸/₽/¥; suffix for сўм.
  return cur === 'UZS' ? `${n} ${sym}` : `${sym}${n}`;
};

// Canonical Trip:
//   id, from, to, transit, departure, arrival,
//   truckType, capacityTons, availableM3,
//   price, currency, driverId, driverName, driverPhone,
//   status, createdAt, isTrip: true
export const normalizeTrip = (raw) => {
  if (!raw) return null;
  return {
    id: raw.id || raw.trip_id || null,
    from: pick(raw.from_city, raw.from, raw.fromCity),
    to: pick(raw.to_city, raw.to, raw.toCity),
    transit: pick(raw.transit, raw.transitCity, raw.transit_city),
    departure: pick(raw.departure, raw.departure_date, raw.departureDate),
    arrival: pick(raw.arrival, raw.arrival_date, raw.arrivalDate),
    truckType: pick(raw.truck_type, raw.truckType, raw.type),
    capacityTons: raw.capacity_tons ?? raw.capacityTons ?? raw.tons ?? null,
    availableM3: raw.available_m3 ?? raw.availableM3 ?? raw.m3 ?? raw.available_volume_m3 ?? null,
    price: raw.price ?? null,
    currency: pick(raw.currency, 'USD'),
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

// Canonical Cargo:
//   id, from, to, cargoDesc, cargoType,
//   weightTons, volumeM3, price, pickupDate,
//   ownerId, ownerName, ownerPhone,
//   bidsCount, status, createdAt, photos, isMine
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
    currency: pick(raw.currency, 'USD'),
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
  // Stage 17/20: weight and volume ship as two separate display
  // fields. Detail screens render them as two distinct rows so a
  // missing volume doesn't shadow the present weight (and vice
  // versa). The legacy combined `weightVol` field was kept around
  // for backward-compat but no caller reads it any more, so it's
  // gone from the display object too.
  const weight = cargo?.weightTons > 0 ? `${cargo.weightTons} т` : dash;
  const volume = cargo?.volumeM3 > 0 ? `${cargo.volumeM3} м³` : dash;
  // Stage 9: scrub QA markers / agent ids / currency-regression
  // labels from any text we surface to the user. The source row may
  // still carry them so the QA cleanup script can find the record.
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

// Display-time helper: converts canonical fields to UI strings with safe
// fallbacks. Use in detail screens so "—" only shows for genuinely missing
// fields, not for transient state during normalization.
export const tripDisplay = (trip, t) => {
  const dash = (t && t('not_specified')) || 'Не указано';
  const truck = trip?.truckType ? (t ? t(trip.truckType) : trip.truckType) : dash;
  // Stage 9: same sanitiser pass for trip detail display.
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
