import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localizeExpiryNotification } from '../../src/utils/expiryNotificationLocale.js';
import { LANGUAGES } from '../../src/utils/languages.js';

const item = {type: 'listing_lifecycle', event_key: 'listing-expired:cargo:test:period', title: 'Срок публикации истёк', body: 'Объявление сохранено в личной истории.'};
for (const {code} of LANGUAGES) test(`${code}: срок отображается на языке интерфейса`, () => {
  const localized = localizeExpiryNotification(item, code);
  assert.ok(localized.title && localized.body);
  if (code !== 'RU') assert.notEqual(localized.title, item.title);
});
test('другие уведомления сохраняют текст без изменений', () => {
  const other = {...item, event_key:'listing-reminder:cargo:test', title:'Другое событие', body:'Текст'};
  assert.equal(localizeExpiryNotification(other, 'TR'), other);
});
test('экран использует локализацию только для подтверждённого события', () => {
  assert.match(readFileSync('src/screens/NotificationsScreen.js','utf8'), /localizeExpiryNotification\(item, lang\)/);
});
