import test from 'node:test';
import assert from 'node:assert/strict';
import { dealMessagePreview } from '../../src/utils/dealMessagePreview.js';

test('системное событие в превью сделки локализуется на язык получателя', () => {
  const deal = { last_message: '🚛 Рейс начался', last_message_sender_id: 'system' };
  assert.equal(dealMessagePreview(deal, 'ZH'), '🚛 运输已开始');
  assert.equal(dealMessagePreview(deal, 'RU'), deal.last_message);
});

test('совпадающий текст участника и legacy API без автора остаются в оригинале', () => {
  for (const sender of ['driver', 'shipper', undefined, null]) {
    const deal = { last_message: '🚛 Рейс начался', last_message_sender_id: sender };
    assert.equal(dealMessagePreview(deal, 'ZH'), deal.last_message);
  }
  assert.equal(dealMessagePreview(null, 'ZH'), '');
});
