#!/usr/bin/env node
require('@babel/register');

const fs = require('fs');
const path = require('path');
const { buildCargoShareText, buildTripShareText } = require('../../src/utils/share');

const trip = {
  from: 'Бахты ↔ Чугучак, 🇰🇿',
  to: 'Казань, 🇷🇺',
  truckTypeLabel: '帆布',
  capacityTons: 19,
  availableM3: 120,
  departure: '2026-08-16',
  price: 7500,
  currency: 'USD',
};

const expected = {
  RU: ['UrTruck рейс', 'Бахты ↔ Чугучак', 'Казань', 'Выезд:', 'Цена:', '7 500 USD'],
  KK: ['UrTruck рейсі', 'Шығу:', 'Бағасы:', '7 500 USD'],
  ZH: ['UrTruck 行程', '巴克图 ↔ 塔城', '喀山', '篷布车', '出发日期: 2026年8月16日', '运费: 7 500 USD', '19 吨', '120 立方米'],
  EN: ['UrTruck trip', 'Bakhty ↔ Chuguchak', 'Kazan', 'Departure:', 'Price:', '7 500 USD'],
};

for (const [lang, needles] of Object.entries(expected)) {
  const text = buildTripShareText(trip, 'https://urtruck.kz/trip/1', lang);
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${lang}: missing ${needle}\n${text}`);
  }
  if (lang === 'ZH' && /[А-Яа-яЁё]/.test(text)) {
    throw new Error(`ZH: Cyrillic system text leak\n${text}`);
  }
}

const cargoZh = buildCargoShareText({
  from: 'Иу', to: 'Москва', cargoDesc: 'Обувь',
  weightTons: 10, volumeM3: 60, pickupDate: '2026-08-20', price: 0,
}, '', 'ZH');
for (const needle of ['UrTruck 货物', '义乌', '莫斯科', '鞋类', '装货日期: 2026年8月20日', '10 吨', '60 立方米', '运费: 面议']) {
  if (!cargoZh.includes(needle)) throw new Error(`ZH cargo: missing ${needle}\n${cargoZh}`);
}
if (/[А-Яа-яЁё]/.test(cargoZh)) throw new Error(`ZH cargo Cyrillic system leak\n${cargoZh}`);

const root = path.resolve(__dirname, '../..');
const routeMap = fs.readFileSync(path.join(root, 'src/components/RouteMap.js'), 'utf8');
if (/yandex\.com\/maps|planned-route-open-btn/.test(routeMap)) {
  throw new Error('RouteMap must not send the primary flow to an external map');
}
for (const needle of ['marketAPI.getDealLocation', '<TruckMap', 'tracking_starts_after_start']) {
  if (!routeMap.includes(needle)) throw new Error(`RouteMap live contract missing: ${needle}`);
}

const chat = fs.readFileSync(path.join(root, 'src/screens/ChatScreen.js'), 'utf8');
for (const needle of ['getCurrentLocationPayload', "translate('deal_created')", 'marketAPI.sendDealLocation']) {
  if (!chat.includes(needle)) throw new Error(`Chat GPS/i18n contract missing: ${needle}`);
}

console.log('✓ Share locale RU/KK/ZH/EN + Chinese routes + in-app live map contract');
