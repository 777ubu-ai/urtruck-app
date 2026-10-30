import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTERNAL_FREIGHT_CARD_ACTIONS, externalFreightCardActions } from '../../src/utils/externalFreightCardActions.js';

const languages = ['RU', 'KK', 'EN', 'ZH', 'TR', 'UZ', 'KY', 'TG', 'BE'];

test('actions in the external freight card have non-empty localized labels in all nine languages', () => {
  assert.deepEqual(Object.keys(EXTERNAL_FREIGHT_CARD_ACTIONS).sort(), [...languages].sort());
  for (const lang of languages) {
    const copy = externalFreightCardActions(lang);
    for (const key of ['show', 'less', 'whatsapp', 'unavailable']) assert.ok(copy[key]?.trim(), `${lang}.${key}`);
  }
  assert.equal(EXTERNAL_FREIGHT_CARD_ACTIONS.RU.show, 'Показать');
  assert.equal(EXTERNAL_FREIGHT_CARD_ACTIONS.RU.less, 'Свернуть');
  assert.equal(externalFreightCardActions('RU').show, 'Показать');
});
