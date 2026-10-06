import test from 'node:test';
import assert from 'node:assert/strict';
import { nearBottomFromScrollEvent } from '../../src/utils/chatScrollMetrics.js';

const scrollEvent = ({ offset = 0, content = 1000, viewport = 400 } = {}) => ({
  nativeEvent: {
    contentOffset: { y: offset },
    contentSize: { height: content },
    layoutMeasurement: { height: viewport },
  },
});

test('scroll metrics reject null and incomplete native events without inventing a position', () => {
  assert.equal(nearBottomFromScrollEvent(null), null);
  assert.equal(nearBottomFromScrollEvent({ nativeEvent: null }), null);
  assert.equal(nearBottomFromScrollEvent({ nativeEvent: { contentOffset: { y: 12 } } }), null);
  assert.equal(nearBottomFromScrollEvent(scrollEvent({ content: Number.NaN })), null);
});

test('scroll metrics preserve correct near-bottom decisions for valid native measurements', () => {
  assert.equal(nearBottomFromScrollEvent(scrollEvent({ offset: 530 })), true);
  assert.equal(nearBottomFromScrollEvent(scrollEvent({ offset: 519 })), false);
});

test('scroll metrics use values synchronously and do not retain a mutable event object', () => {
  const event = scrollEvent({ offset: 530 });
  const result = nearBottomFromScrollEvent(event);
  event.nativeEvent.contentSize.height = 5000;
  assert.equal(result, true);
});
