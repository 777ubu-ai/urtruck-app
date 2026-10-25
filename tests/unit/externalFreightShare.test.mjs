import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExternalFreightShare, URTRUCK_ANDROID_STORE, URTRUCK_IOS_STORE } from '../../src/utils/externalFreightShare.js';

const item = { id: 'external-id', kind: 'cargo', status: 'active', origin: 'Хоргос', destination: 'Алматы', original_text: 'СЕКРЕТНОЕ ДЛИННОЕ ОПИСАНИЕ', contacts: ['+77000000000'] };
const options = { origin: 'https://qa2.urtruck.kz', lang: 'RU', summary: 'Тент · 25 т · 150 м³', price: '4 500 USD' };
for (const kind of ['cargo', 'vehicle']) {
  test(`${kind}: краткое сообщение с маршрутом, ценой и двумя подписанными ссылками магазинов`, () => {
    const before = JSON.stringify(item);
    const result = buildExternalFreightShare({ ...item, kind }, options);
    assert.ok(result.text.includes(kind === 'cargo' ? 'UrTruck · Груз' : 'UrTruck · Машина'));
    assert.ok(result.text.includes('Хоргос → Алматы'));
    assert.ok(result.text.includes(options.summary));
    assert.ok(result.text.includes('4 500 USD'));
    assert.ok(result.text.includes(`Android: ${URTRUCK_ANDROID_STORE}`));
    assert.ok(result.text.endsWith(`iPhone: ${URTRUCK_IOS_STORE}`));
    assert.ok(!result.text.includes('https://qa2.urtruck.kz'));
    assert.equal(result.text.match(/https:\/\//g).length, 2);
    assert.ok(!result.text.includes(item.original_text));
    assert.ok(!result.text.includes(item.contacts[0]));
    assert.ok(!result.url.includes(item.id));
    assert.equal(JSON.stringify(item), before);
  });
}
for (const price of ['1 500 KZT', '80 EUR', 'Договорная', 'Цена не указана']) {
  test(`цена сохраняется без пересчёта: ${price}`, () => {
    const result = buildExternalFreightShare(item, { ...options, price });
    assert.ok(result.text.split('\n').includes(price));
    assert.ok(!result.text.includes('USD'));
  });
}
test('закрытые, скрытые и истёкшие объявления не отправляются', () => {
  for (const status of ['closed', 'expired', 'unavailable', 'review', 'hidden']) assert.equal(buildExternalFreightShare({ ...item, status }, options), null);
  assert.equal(buildExternalFreightShare({ ...item, expires_at: '2026-10-21T00:00:00Z' }, { ...options, now: Date.parse('2026-10-22T00:00:00Z') }), null);
  assert.equal(buildExternalFreightShare({ ...item, expires_at: 'invalid' }, options), null);
});
test('публичный адрес ограничен окружением, произвольные хосты и HTTP отвергаются', () => {
  for (const origin of ['', 'http://qa2.urtruck.kz', 'https://evil.test', 'https://qa2.urtruck.kz.evil.test', 'https://user@urtruck.kz', 'https://urtruck.kz/path']) assert.equal(buildExternalFreightShare(item, { ...options, origin }), null);
  assert.equal(buildExternalFreightShare(item, { ...options, origin: 'https://urtruck.kz/' }).url, URTRUCK_IOS_STORE);
});
test('исходные названия сохраняются, управляющие символы не добавляют строки', () => {
  const result = buildExternalFreightShare({ ...item, origin: 'Almaty\n\t', destination: 'Ташкент' }, options);
  assert.ok(result.text.includes('Almaty → Ташкент'));
  assert.ok(!result.text.includes('Алматы'));
});
