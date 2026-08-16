// Share-text builders.
// Telegram/WhatsApp/WeChat receive plain unicode strings. All system fields
// are rendered in the recipient/current app locale; user free text stays as
// entered by its author.

import { formatPrice } from './normalizers';
import { formatDateForDisplay } from './dateInput';
import { formatTruckType } from './i18n';
import { localizeCargoName, localizePlace } from './places';

const ZW_RE = /[­​‌‍﻿�]/g;
const norm = (s) => String(s || '').replace(ZW_RE, '').trim();
const dash = (s, fallback = '—') => (norm(s) || fallback);

const SHARE_COPY = {
  RU: { trip: 'UrTruck рейс', cargo: 'UrTruck груз', departure: 'Выезд', date: 'Дата', price: 'Цена', negotiable: 'По договорённости', ton: 'т', volume: 'м³' },
  KK: { trip: 'UrTruck рейсі', cargo: 'UrTruck жүгі', departure: 'Шығу', date: 'Күні', price: 'Бағасы', negotiable: 'Келісім бойынша', ton: 'т', volume: 'м³' },
  ZH: { trip: 'UrTruck 行程', cargo: 'UrTruck 货物', departure: '出发日期', date: '装货日期', price: '运费', negotiable: '面议', ton: '吨', volume: '立方米' },
  EN: { trip: 'UrTruck trip', cargo: 'UrTruck cargo', departure: 'Departure', date: 'Pickup date', price: 'Price', negotiable: 'Negotiable', ton: 't', volume: 'm³' },
};

const copyFor = (lang) => SHARE_COPY[String(lang || 'RU').toUpperCase()] || SHARE_COPY.EN;

export const buildTripShareText = (trip, url, lang = 'RU') => {
  const t = trip || {};
  const copy = copyFor(lang);
  const from = dash(localizePlace(t.from || t.from_city, lang));
  const to = dash(localizePlace(t.to || t.to_city, lang));
  const rawTruckType = norm(t.truckTypeLabel || t.truck_type || t.truckType || '');
  const truckType = rawTruckType ? formatTruckType(rawTruckType) : '';
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

// Open Graph helpers accept an optional locale so shared public previews can
// be generated without forcing Russian system text.
export const buildTripTitle = (trip, lang = 'RU') => {
  const t = trip || {};
  const copy = copyFor(lang);
  return `${copy.trip}: ${dash(localizePlace(t.from || t.from_city, lang))} → ${dash(localizePlace(t.to || t.to_city, lang))}`;
};

export const buildCargoTitle = (cargo, lang = 'RU') => {
  const c = cargo || {};
  const copy = copyFor(lang);
  return `${copy.cargo}: ${dash(localizePlace(c.from || c.from_city, lang))} → ${dash(localizePlace(c.to || c.to_city, lang))}`;
};

export const buildTripDescription = (trip, lang = 'RU') =>
  buildTripShareText(trip, '', lang).replace(new RegExp(`^${copyFor(lang).trip}\\n`), '').replace(/\n+$/, '').replace(/\n/g, ' · ');

export const buildCargoDescription = (cargo, lang = 'RU') =>
  buildCargoShareText(cargo, '', lang).replace(new RegExp(`^${copyFor(lang).cargo}\\n`), '').replace(/\n+$/, '').replace(/\n/g, ' · ');
