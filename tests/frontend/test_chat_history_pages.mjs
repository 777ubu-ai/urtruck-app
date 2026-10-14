import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatHistoryPages } from '../../src/utils/chatHistoryPages.js';
const message = id => ({ id, text: String(id), created_at: '2026-10-07T00:00:00Z' });
const range = (start, end) => Array.from({ length: end - start }, (_, i) => message(start + i));
test('history beyond 100 remains accessible and later polls retain loaded pages', () => {
  const h = createChatHistoryPages(); h.merge(range(151, 251)); assert.equal(h.offset(), 100); assert.equal(h.hasOlder(), true);
  let data = h.merge(range(51, 151), true); assert.equal(data.length, 200);
  data = h.merge(range(1, 51), true); assert.equal(data.length, 250); assert.equal(h.hasOlder(), false);
  data = h.merge(range(152, 252)); assert.equal(data.length, 251); assert.equal(data[0].id, 1); assert.equal(data.at(-1).id, 251);
});
test('new arrivals shifting offset do not duplicate messages; known rows update', () => {
  const h = createChatHistoryPages(3); h.merge(range(4, 7)); let data = h.merge(range(2, 5), true);
  assert.deepEqual(data.map(m => m.id), [2, 3, 4, 5, 6]);
  data = h.merge([{ ...message(6), is_read: true }, message(7), message(8)]);
  assert.equal(data.find(m => m.id === 6).is_read, true); assert.equal(h.offset(), 7);
});
test('invalid response cannot erase loaded history; empty last page ends pagination', () => {
  const h = createChatHistoryPages(2); h.merge(range(1, 3)); assert.throws(() => h.merge(null)); assert.equal(h.offset(), 2);
  assert.equal(h.merge([], true).length, 2); assert.equal(h.hasOlder(), false);
});
