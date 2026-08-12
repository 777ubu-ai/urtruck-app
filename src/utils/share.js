// Share-text builders.
//
// Telegram/WhatsApp/WeChat all encode their share-URL bodies as URI-encoded
// UTF-8. We pre-render plain unicode strings and let `encodeURIComponent`
// do the rest at the call site (see ShareModal). Two rules keep previews
// clean cross-platform:
//   1. NEVER inject "\r\n" — both Telegram and WhatsApp render that as
//      one literal line break, but iOS replaces \r with U+FFFD.
//   2. Strip the ZWSP / soft-hyphen junk that creeps in from copy-paste of
//      Cyrillic city names (e.g. "Ал­маты").
//
// Templates match the brand spec and read top-to-bottom:
//   1) Title  ("UrTruck рейс" / "UrTruck груз")
//   2) Route  ("Иу → Москва")
//   3) Vehicle/cargo line (truck type · weight · volume)
//   4) Date   ("Выезд: 04.05.2026" / "Дата: 06.05.2026")
//   5) Price  ("Цена: $12 000" or "Цена: По договорённости")
//   6) URL    (deep-link or marketing root)

import { formatPrice } from './normalizers';
import { formatDateForDisplay } from './dateInput';
import { localizeCargoName, localizePlace } from './places';

const ZW_RE = /[­​‌‍﻿�]/g;
const norm = (s) => String(s || '').replace(ZW_RE, '').trim();

const dash = (s, fallback = '—') => (norm(s) || fallback);

const SHARE_COPY = {
  RU: { trip: 'UrTruck рейс', cargo: 'UrTruck груз', departure: 'Выезд', date: 'Дата', price: 'Цена', negotiable: 'По договорённости', ton: 'т', volume: 'м³' },
  KK: { trip: 'UrTruck рейсі', cargo: 'UrTruck жүгі', departure: 'Шығу', date: 'Күні', price: 'Бағасы', negotiable: 'Келісім бойынша', ton: 'т', volume: 'м³' },
  ZH: { trip: 'UrTruck 行程', cargo: 'UrTruck 货物', departure: '出发日期', date: '装货日期', price: '价格', negotiable: '面议', ton: '吨', volume: '立方米' },
  EN: { trip: 'UrTruck trip', cargo: 'UrTruck cargo', departure: 'Departure', date: 'Pickup date', price: 'Price', negotiable: 'Negotiable', ton: 't', volume: 'm³' },
};

const copyFor = (lang) => SHARE_COPY[String(lang || 'RU').toUpperCase()] || SHARE_COPY.RU;

export const buildTripShareText = (trip, url, lang = 'RU') => {
  const t = trip || {};
  const copy = copyFor(lang);
  const from = dash(localizePlace(t.from || t.from_city, lang));
  const to = dash(localizePlace(t.to || t.to_city, lang));
  const truckType = norm(t.truckTypeLabel || t.truck_type || t.truckType || '');
  const tons = (t.capacityTons ?? t.capacity_tons ?? t.tons);
  const m3 = (t.availableM3 ?? t.available_m3 ?? t.m3);
  const departure = norm(t.departure ? formatDateForDisplay(t.departure) : '');
  const priceText = formatPrice(t.price, t.currency, () => copy.negotiable);
  const truckLine = [truckType, tons ? `${tons} ${copy.ton}` : null, m3 ? `${m3} ${copy.volume}` : null]
    .filter(Boolean).join(' · ');

  return [
    copy.trip,
    `${from} → ${to}`,
    '',
    truckLine || '',
    departure ? `${copy.departure}: ${departure}` : '',
    `${copy.price}: ${priceText}`,
    '',
    norm(url),
  ].filter((line, i, arr) => {
    // collapse consecutive blank lines so the preview doesn't end up with
    // 3-line gaps when an optional field is missing.
    if (line) return true;
    return i === 0 || arr[i - 1] !== '';
  }).join('\n').trim();
};

export const buildCargoShareText = (cargo, url, lang = 'RU') => {
  const c = cargo || {};
  const copy = copyFor(lang);
  const from = dash(localizePlace(c.from || c.from_city, lang));
  const to = dash(localizePlace(c.to || c.to_city, lang));
  const desc = norm(localizeCargoName(c.cargoDesc || c.cargo_desc || c.cargo, lang));
  const tons = (c.weightTons ?? c.weight_tons ?? c.tons);
  const m3 = (c.volumeM3 ?? c.volume_m3 ?? c.m3);
  const pickup = norm(c.pickupDate ? formatDateForDisplay(c.pickupDate) : (c.pickup_date ? formatDateForDisplay(c.pickup_date) : ''));
  const priceText = formatPrice(c.price, c.currency, () => copy.negotiable);
  const sizeLine = [tons ? `${tons} ${copy.ton}` : null, m3 ? `${m3} ${copy.volume}` : null].filter(Boolean).join(' · ');

  return [
    copy.cargo,
    `${from} → ${to}`,
    '',
    desc || '',
    sizeLine || '',
    pickup ? `${copy.date}: ${pickup}` : '',
    `${copy.price}: ${priceText}`,
    '',
    norm(url),
  ].filter((line, i, arr) => {
    if (line) return true;
    return i === 0 || arr[i - 1] !== '';
  }).join('\n').trim();
};

// Short, brand-prefixed title for Open Graph / og:title.
export const buildTripTitle = (trip) => {
  const t = trip || {};
  return `UrTruck рейс: ${dash(t.from || t.from_city)} → ${dash(t.to || t.to_city)}`;
};

export const buildCargoTitle = (cargo) => {
  const c = cargo || {};
  return `UrTruck груз: ${dash(c.from || c.from_city)} → ${dash(c.to || c.to_city)}`;
};

// Detail line for og:description.
export const buildTripDescription = (trip) =>
  buildTripShareText(trip, '').replace(/^UrTruck рейс\n/, '').replace(/\n+$/, '').replace(/\n/g, ' · ');

export const buildCargoDescription = (cargo) =>
  buildCargoShareText(cargo, '').replace(/^UrTruck груз\n/, '').replace(/\n+$/, '').replace(/\n/g, ' · ');
