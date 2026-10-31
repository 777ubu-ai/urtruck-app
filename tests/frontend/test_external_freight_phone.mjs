import test from 'node:test';
import assert from 'node:assert/strict';
import { externalPhoneURL, externalTelegramContactURL, externalWhatsAppURL } from '../../src/utils/externalFreightContact.js';
test('форматированный номер сохраняет страну и не меняет исходную строку', () => {
  const number = '+7 (700) 000-00-01';
  assert.equal(externalPhoneURL(number), 'tel:+77000000001');
  assert.equal(number, '+7 (700) 000-00-01');
  assert.equal(externalPhoneURL('998500014250'), 'tel:998500014250');
});
test('произвольный контакт и управляющие tel-параметры не запускают звонок', () => {
  for (const value of [null, '', '@user', 'https://t.me/user', '+77000000001;123', '*123#', '+77000000001,+77000000002', '123', '+1234567890123456', 'звоните 77000000001']) assert.equal(externalPhoneURL(value), null, String(value));
});

test('явный Telegram-контакт открывается отдельно от источника-поста', () => {
  assert.equal(externalTelegramContactURL('@source_user'), 'https://t.me/source_user');
  assert.equal(externalTelegramContactURL('https://t.me/source_user'), 'https://t.me/source_user');
  for (const value of ['https://t.me/source_user/123', 'https://t.me/c/123/456', 'https://t.me/+invite', 'https://evil.test/user', '@source_user?x=1', 'пишите автору', '']) assert.equal(externalTelegramContactURL(value), null);
});

test('WhatsApp открывает только явный международный номер и получает черновик объявления', () => {
  const draft = 'UrTruck · Cargo\nBuxoro → Toshkent';
  assert.equal(externalWhatsAppURL('+998 90 123 45 67', draft), `https://wa.me/998901234567?text=${encodeURIComponent(draft)}`);
  for (const value of ['998901234567', '0901234567', '+0123456789', '+1234567', '+1234567890123456', '@author']) {
    assert.equal(externalWhatsAppURL(value, draft), null, String(value));
  }
});
