// Share-text builders.
// Keep this module PURE: it is used by Node QA and must not import runtime
// i18n/storage/React-Native. System geography/category localization is pure
// (`places.js`); dates, money and truck labels are formatted locally here.

import { localizeCargoName, localizePlace } from './places';

const ZW_RE = /[­​‌‍﻿�]/g;
const norm = (s) => String(s || '').replace(ZW_RE, '').trim();
const dash = (s, fallback = '—') => (norm(s) || fallback);

const SHARE_COPY = {
  RU: { trip: 'UrTruck рейс', cargo: 'UrTruck груз', departure: 'Выезд', date: 'Дата погрузки', price: 'Цена', negotiable: 'По договорённости', ton: 'т', volume: 'м³' },
  KK: { trip: 'UrTruck рейсі', cargo: 'UrTruck жүгі', departure: 'Шығу', date: 'Тиеу күні', price: 'Бағасы', negotiable: 'Келісім бойынша', ton: 'т', volume: 'м³' },
  ZH: { trip: 'UrTruck 行程', cargo: 'UrTruck 货物', departure: '出发日期', date: '装货日期', price: '运费', negotiable: '面议', ton: '吨', volume: '立方米' },
  EN: { trip: 'UrTruck trip', cargo: 'UrTruck cargo', departure: 'Departure', date: 'Pickup date', price: 'Price', negotiable: 'Negotiable', ton: 't', volume: 'm³' },
};

const copyFor = (lang) => SHARE_COPY[String(lang || 'RU').toUpperCase()] || SHARE_COPY.EN;

const CURRENCY_ALIASES = {
  '$': 'USD', 'US$': 'USD', USD: 'USD',
  '₸': 'KZT', KZT: 'KZT', ТГ: 'KZT', ТЕНГЕ: 'KZT',
  '₽': 'RUB', RUB: 'RUB', РУБ: 'RUB',
  '¥': 'CNY', '￥': 'CNY', CNY: 'CNY', RMB: 'CNY', ЮАНЬ: 'CNY',
};

const normalizeCurrency = (currency, fallback = 'USD') => {
  const raw = String(currency || '').trim().toUpperCase();
  return CURRENCY_ALIASES[raw] || (['USD', 'KZT', 'RUB', 'CNY'].includes(raw) ? raw : fallback);
};

const formatSharePrice = (amount, currency, copy) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return copy.negotiable;
  const rounded = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  const [whole, fraction] = rounded.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const number = fraction ? `${grouped}.${fraction}` : grouped;
  return `${number} ${normalizeCurrency(currency)}`;
};

const formatShareDate = (value, lang) => {
  const raw = norm(value);
  if (!raw) return '';
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) {
    const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
    if (!dmy) return raw;
    m = [dmy[0], dmy[3], dmy[2].padStart(2, '0'), dmy[1].padStart(2, '0')];
  }
  if (String(lang).toUpperCase() === 'ZH') {
    return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
  }
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const TRUCK_LABELS = {
  tent: { RU: 'Тент', KK: 'Тент', ZH: '篷布车', EN: 'Curtainsider' },
  ref: { RU: 'Рефрижератор', KK: 'Рефрижератор', ZH: '冷藏车', EN: 'Refrigerated truck' },
  izoterm: { RU: 'Изотерм', KK: 'Изотерм', ZH: '保温车', EN: 'Insulated truck' },
  platform: { RU: 'Площадка', KK: 'Платформа', ZH: '平板车', EN: 'Platform' },
  open_truck: { RU: 'Бортовой', KK: 'Бортты', ZH: '栏板车', EN: 'Flatbed truck' },
  tanker: { RU: 'Цистерна', KK: 'Цистерна', ZH: '罐车', EN: 'Tanker' },
  auto: { RU: 'Автовоз', KK: 'Автовоз', ZH: '汽车运输车', EN: 'Car carrier' },
  cont20: { RU: "Контейнер 20'", KK: "20' контейнер", ZH: '20尺集装箱', EN: "20' container" },
  cont40: { RU: "Контейнер 40'", KK: "40' контейнер", ZH: '40尺集装箱', EN: "40' container" },
};

const LEGACY_TRUCK_ZH = {
  'Тент': '篷布车', 'Фура': '大型货车', 'Рефрижератор': '冷藏车', 'Изотерм': '保温车',
  'Бортовой': '栏板车', 'Площадка': '平板车', 'Автовоз': '汽车运输车', 'Цистерна': '罐车',
  "Контейнер 20'": '20尺集装箱', "Контейнер 40'": '40尺集装箱',
  'Контейнер 20′': '20尺集装箱', 'Контейнер 40′': '40尺集装箱',
  '帆布': '篷布车', '篷布': '篷布车',
};

const formatShareTruckType = (raw, lang) => {
  const value = norm(raw);
  if (!value) return '';
  const locale = String(lang || 'RU').toUpperCase();
  if (TRUCK_LABELS[value]?.[locale]) return TRUCK_LABELS[value][locale];
  if (locale === 'ZH') return LEGACY_TRUCK_ZH[value] || value;
  return value;
};

export const buildTripShareText = (trip, url, lang = 'RU') => {
  const t = trip || {};
  const copy = copyFor(lang);
  const from = dash(localizePlace(t.from || t.from_city, lang));
  const to = dash(localizePlace(t.to || t.to_city, lang));
  const truckType = formatShareTruckType(t.truckTypeLabel || t.truck_type || t.truckType, lang);
  const tons = (t.capacityTons ?? t.capacity_tons ?? t.tons);
  const m3 = (t.availableM3 ?? t.available_m3 ?? t.m3);
  const departure = formatShareDate(t.departure || t.departure_date, lang);
  const priceText = formatSharePrice(t.price, t.currency, copy);
  const truckLine = [truckType, tons ? `${tons} ${copy.ton}` : null, m3 ? `${m3} ${copy.volume}` : null]
    .filter(Boolean).join(' · ');

  return [
    copy.trip,
    `${from} → ${to}`,
    '',
    truckLine,
    departure ? `${copy.departure}: ${departure}` : '',
    `${copy.price}: ${priceText}`,
    '',
    norm(url),
  ].filter((line, i, arr) => line || i === 0 || arr[i - 1] !== '').join('\n').trim();
};

export const buildCargoShareText = (cargo, url, lang = 'RU') => {
  const c = cargo || {};
  const copy = copyFor(lang);
  const from = dash(localizePlace(c.from || c.from_city, lang));
  const to = dash(localizePlace(c.to || c.to_city, lang));
  const desc = norm(localizeCargoName(c.cargoDesc || c.cargo_desc || c.cargo, lang));
  const tons = (c.weightTons ?? c.weight_tons ?? c.tons);
  const m3 = (c.volumeM3 ?? c.volume_m3 ?? c.m3);
  const pickup = formatShareDate(c.pickupDate || c.pickup_date, lang);
  const priceText = formatSharePrice(c.price, c.currency, copy);
  const sizeLine = [tons ? `${tons} ${copy.ton}` : null, m3 ? `${m3} ${copy.volume}` : null]
    .filter(Boolean).join(' · ');

  return [
    copy.cargo,
    `${from} → ${to}`,
    '',
    desc,
    sizeLine,
    pickup ? `${copy.date}: ${pickup}` : '',
    `${copy.price}: ${priceText}`,
    '',
    norm(url),
  ].filter((line, i, arr) => line || i === 0 || arr[i - 1] !== '').join('\n').trim();
};

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
