import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { localizeNotification } from '../../src/utils/notificationEvents.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const dictionaries = {
  RU: {
    notif_event_deal_awaiting_confirmation_title: 'Доставлено — ожидает подтверждения',
    notif_event_deal_route_body: '{from_city} → {to_city} · {amount}',
  },
  KK: {
    notif_event_deal_awaiting_confirmation_title: 'Жеткізілді — растау күтілуде',
    notif_event_deal_route_body: '{from_city} → {to_city} · {amount}',
  },
  ZH: {
    notif_event_deal_awaiting_confirmation_title: '已送达 — 等待确认',
    notif_event_deal_route_body: '{from_city} → {to_city} · {amount}',
  },
  EN: {
    notif_event_deal_awaiting_confirmation_title: 'Delivered — awaiting confirmation',
    notif_event_deal_route_body: '{from_city} → {to_city} · {amount}',
  },
};
const item = {
  title: 'Russian fallback must not win',
  body: 'Russian fallback body',
  event_type: 'deal.status_changed',
  event_payload: { status: 'awaiting_confirmation', from_city: 'Almaty', to_city: 'Urumqi', amount: '$3,500' },
};
for (const [lang, dictionary] of Object.entries(dictionaries)) {
  const localized = localizeNotification(item, (key) => dictionary[key] || key);
  assert.equal(localized.title, dictionary.notif_event_deal_awaiting_confirmation_title, lang);
  assert.equal(localized.body, 'Almaty → Urumqi · $3,500', lang);
}
assert.deepEqual(
  localizeNotification({ title: 'Legacy', body: 'Stored copy' }, (key) => key),
  { title: 'Legacy', body: 'Stored copy' },
);

const notificationsApi = read('src/utils/notificationsAPI.js');
assert.match(notificationsApi, /if \(!response\.ok\)/);
assert.match(notificationsApi, /failure\.code = 'network'/);
const screens = [
  read('src/screens/MyTripsScreen.js'),
  read('src/screens/ChatsListScreen.js'),
  read('src/screens/NotificationsScreen.js'),
];
for (const source of screens) {
  assert.match(source, /loadError/);
  assert.match(source, /load_error_retry_desc|notifications_load_error/);
}
const i18n = read('src/utils/i18n.js');
for (const key of [
  'load_error_retry_desc',
  'notifications_load_error',
  'notif_event_deal_awaiting_confirmation_title',
  'notif_event_deal_route_body',
]) {
  assert.equal((i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 4, `${key} must exist in RU/KK/ZH/EN`);
}

console.log('Notification error/locale contract: PASS');
