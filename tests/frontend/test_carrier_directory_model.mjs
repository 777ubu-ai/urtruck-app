import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeLiveFeed, externalTelegramPost } from '../../src/utils/externalFreightModel.js';

test('обновление головы общей ленты сохраняет загруженные контакты без фиктивной даты', () => {
  const ad = { id: 'real-ad', status: 'active', source_published_at: '2026-10-23T10:00:00Z', expires_at: '2026-10-28T10:00:00Z' };
  const one = { id: 'contact-one', kind: 'carrier_contact', status: 'active', expires_at: null, source_published_at: null, directory_sequence: 1 };
  const two = { ...one, id: 'contact-two', directory_sequence: 2 };
  const result = mergeLiveFeed([ad, one, two], [ad, one], { now: Date.parse('2026-10-23T11:00:00Z'), hasMore: true });
  assert.deepEqual(result.map(x => x.id), ['real-ad', 'contact-one', 'contact-two']);
  assert.equal(externalTelegramPost(one), null);
});

test('контакты не исчезают через 120 часов, скрытая карточка не возвращается', () => {
  const one = { id: 'one', kind: 'carrier_contact', status: 'active', expires_at: null, source_published_at: null, directory_sequence: 1 };
  const hidden = { ...one, id: 'hidden', status: 'hidden', directory_sequence: 2 };
  assert.deepEqual(mergeLiveFeed([one, hidden], [one], { now: Date.parse('2030-01-01T00:00:00Z'), hasMore: true }).map(x => x.id), ['one']);
});
