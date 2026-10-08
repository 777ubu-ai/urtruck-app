// Regression for the Android legacy stack that surfaced:
// "Cannot read property 'contentSize' of null" from DealWorkspaceScreenV2.
// Execute the real FlatList scroll callback and exercise the native event
// shapes seen during Android IME/layout reconciliation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const scrollBody = workspace.match(/onScroll=\{\(event\) => \{([\s\S]*?)\n                    \}\}/)?.[1];

assert.ok(scrollBody, 'DealWorkspaceScreenV2 FlatList onScroll callback must exist');

test('Android legacy null contentSize events never throw or mutate scroll state', () => {
  const nearBottomRef = { current: true };
  const userScrolledAwayRef = { current: true };
  const updates = [];
  const run = new Function(
    'event',
    'nearBottomRef',
    'userScrolledAwayRef',
    'showJumpLatest',
    'setShowJumpLatest',
    scrollBody,
  );
  const malformedEvents = [
    undefined,
    null,
    {},
    { nativeEvent: null },
    { nativeEvent: {} },
    { nativeEvent: { contentSize: null } },
    { nativeEvent: { contentSize: { height: null }, contentOffset: { y: 0 }, layoutMeasurement: { height: 1 } } },
    { nativeEvent: { contentSize: { height: -1 }, contentOffset: { y: 0 }, layoutMeasurement: { height: 1 } } },
  ];

  for (const event of malformedEvents) {
    assert.doesNotThrow(() => run(
      event,
      nearBottomRef,
      userScrolledAwayRef,
      true,
      (value) => updates.push(value),
    ));
  }

  assert.equal(nearBottomRef.current, true);
  assert.equal(userScrolledAwayRef.current, true);
  assert.deepEqual(updates, []);
});

test('Android legacy source has no unsafe direct contentSize height read', () => {
  assert.doesNotMatch(workspace, /event\.nativeEvent\.contentSize\.height/);
  assert.match(workspace, /event\?\.nativeEvent\?\.contentSize\?\.height/);
});
