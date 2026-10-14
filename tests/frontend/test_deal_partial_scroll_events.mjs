import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Исполняем реальный callback FlatList, а не копию защитного алгоритма.
const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const body = source.match(/onScroll=\{\(event\) => \{([\s\S]*?)\n                    \}\}/)?.[1];
assert.ok(body, 'Обработчик скролла списка сообщений найден');

function harness(nearBottom, userScrolledAway, showJumpLatest = false) {
  const nearBottomRef = { current: nearBottom };
  const userScrolledAwayRef = { current: userScrolledAway };
  const updates = [];
  const run = new Function('event', 'nearBottomRef', 'userScrolledAwayRef', 'showJumpLatest', 'setShowJumpLatest', body);
  return {
    nearBottomRef, userScrolledAwayRef, updates,
    scroll: (event) => run(event, nearBottomRef, userScrolledAwayRef, showJumpLatest, (value) => updates.push(value)),
  };
}
const event = (height, y, viewport) => ({ nativeEvent: {
  contentSize: { height }, contentOffset: { y }, layoutMeasurement: { height: viewport },
} });

test('неполные native scroll events не падают и сохраняют последнее достоверное состояние', () => {
  const incomplete = [undefined, null, {}, { nativeEvent: null }, { nativeEvent: {} },
    { nativeEvent: { contentSize: null } },
    { nativeEvent: { contentSize: {}, contentOffset: { y: 1 }, layoutMeasurement: { height: 1 } } },
    { nativeEvent: { contentSize: { height: 100 }, contentOffset: null, layoutMeasurement: { height: 1 } } },
    { nativeEvent: { contentSize: { height: 100 }, contentOffset: { y: 1 }, layoutMeasurement: null } }];
  for (const input of incomplete) {
    for (const previous of [true, false]) {
      const h = harness(previous, true, true);
      assert.doesNotThrow(() => h.scroll(input));
      assert.equal(h.nearBottomRef.current, previous);
      assert.equal(h.userScrolledAwayRef.current, true);
      assert.deepEqual(h.updates, []);
    }
  }
});

test('некорректные измерения не вызывают скачок скролла или изменение jump button', () => {
  for (const input of [event(NaN, 100, 200), event(1000, Infinity, 200),
    event(1000, 100, undefined), event(null, 100, 200), event('1000', 100, 200),
    event(-1, 100, 200), event(1000, 100, 0), event(1000, 100, -20)]) {
    const h = harness(false, true);
    h.scroll(input);
    assert.equal(h.nearBottomRef.current, false);
    assert.equal(h.userScrolledAwayRef.current, true);
    assert.deepEqual(h.updates, []);
  }
});

test('достоверный скролл к последнему сообщению снимает jump и userScrolledAway', () => {
  const h = harness(false, true, true);
  h.scroll(event(1000, 730, 200));
  assert.equal(h.nearBottomRef.current, true);
  assert.equal(h.userScrolledAwayRef.current, false);
  assert.deepEqual(h.updates, [false]);
});

test('достоверный скролл истории показывает jump только после ручного ухода', () => {
  const h = harness(true, true);
  h.scroll(event(1000, 400, 200));
  assert.equal(h.nearBottomRef.current, false);
  assert.equal(h.userScrolledAwayRef.current, true);
  assert.deepEqual(h.updates, [true]);
  const initial = harness(true, false);
  initial.scroll(event(1000, 400, 200));
  assert.equal(initial.nearBottomRef.current, false);
  assert.deepEqual(initial.updates, []);
});

test('iOS overscroll остаётся корректным измерением', () => {
  const h = harness(true, true);
  h.scroll(event(1000, -10, 200));
  assert.equal(h.nearBottomRef.current, false);
  assert.deepEqual(h.updates, [true]);
});
