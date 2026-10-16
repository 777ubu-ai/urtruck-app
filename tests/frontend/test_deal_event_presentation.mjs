import test from 'node:test';
import assert from 'node:assert/strict';
import { dealEventPresentation, stripSystemEventDecoration } from '../../src/utils/dealEventPresentation.js';
import { localizeSystemMessage } from '../../src/utils/places.js';

for (const lang of ['ru', 'en', 'kk', 'zh']) {
  test(`карточка сохраняет локализацию и сумму без выдуманной валюты: ${lang}`, () => {
    const localized = localizeSystemMessage('🤝 Сделка создана · 1100', lang);
    const result = dealEventPresentation(localized);
    assert.equal(`${result.title} · ${result.detail}`, stripSystemEventDecoration(localized));
    assert.equal(result.detail, '1100');
    assert.equal(result.icon, 'handshake-outline');
    assert.doesNotMatch(result.title, /🤝/u);
    if (lang !== 'ru') assert.doesNotMatch(result.title, /Сделка/);
  });
  test(`доставка сохраняет существенное ожидание подтверждения: ${lang}`, () => {
    const localized = localizeSystemMessage('✅ Груз доставлен — ожидается подтверждение получения', lang);
    assert.equal(dealEventPresentation(localized).title, stripSystemEventDecoration(localized));
    assert.equal(dealEventPresentation(localized).detail, '');
  });
}
test('неизвестные/старые строки и содержимое после разделителя не теряются', () => {
  assert.deepEqual(dealEventPresentation('Новое событие · A · B'), {icon: 'information-outline', title: 'Новое событие', detail: 'A · B'});
  assert.equal(stripSystemEventDecoration('🔒 Согласие отменено'), 'Согласие отменено');
  assert.equal(stripSystemEventDecoration('ℹ️ GPS выключен'), 'GPS выключен');
  assert.equal(stripSystemEventDecoration('📄 Неизвестное событие'), '📄 Неизвестное событие');
  assert.equal(dealEventPresentation(null).title, '');
});
test('форматтер не меняет роль, состояние, деньги и исходное событие', () => {
  const source = Object.freeze({text: '🚛 Рейс начался', status: 'completed', amount: 0});
  assert.equal(dealEventPresentation(source.text).icon, 'truck-outline');
  assert.deepEqual(source, {text: '🚛 Рейс начался', status: 'completed', amount: 0});
});
