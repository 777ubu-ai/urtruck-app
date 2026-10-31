import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTERNAL_FREIGHT_CARD_ACTIONS, externalFreightCardActions, externalFreightWhatsAppDraft } from '../../src/utils/externalFreightCardActions.js';

const languages = ['RU', 'KK', 'EN', 'ZH', 'TR', 'UZ', 'KY', 'TG', 'BE'];

test('actions in the external freight card have non-empty localized labels in all nine languages', () => {
  assert.deepEqual(Object.keys(EXTERNAL_FREIGHT_CARD_ACTIONS).sort(), [...languages].sort());
  for (const lang of languages) {
    const copy = externalFreightCardActions(lang);
    for (const key of ['show', 'less', 'whatsapp', 'unavailable', 'choosePhone', 'cancel', 'additionalContacts', 'copyContact', 'cargoDraft', 'vehicleDraft']) assert.ok(copy[key]?.trim(), `${lang}.${key}`);
  }
  assert.equal(EXTERNAL_FREIGHT_CARD_ACTIONS.RU.show, 'Показать');
  assert.equal(EXTERNAL_FREIGHT_CARD_ACTIONS.RU.less, 'Свернуть');
  assert.equal(externalFreightCardActions('RU').show, 'Показать');
});

test('WhatsApp drafts are separate from share text and do not invent missing routes', () => {
  const cargo = externalFreightWhatsAppDraft({ kind: 'cargo', origin: 'Хоргос', destination: 'Алматы', original_text: 'private ad body', price: '11 500 USD', contacts: ['+998901234567'] }, 'RU');
  assert.equal(cargo, 'Здравствуйте! Нашли ваше объявление в UrTruck: Хоргос → Алматы. Хотели уточнить детали перевозки.');
  assert.ok(!cargo.includes('private ad body'));
  assert.ok(!cargo.includes('11 500'));

  const vehicle = externalFreightWhatsAppDraft({ kind: 'vehicle', origin: 'Самарканд' }, 'RU');
  assert.equal(vehicle, 'Здравствуйте! Нашли ваше объявление в UrTruck: Самарканд. Машина ещё доступна?');
  const unknown = externalFreightWhatsAppDraft({ kind: 'vehicle' }, 'RU');
  assert.equal(unknown, 'Здравствуйте! Нашли ваше объявление в UrTruck. Машина ещё доступна?');
  assert.equal(externalFreightWhatsAppDraft({ kind: 'carrier_contact' }, 'RU'), '');
});
