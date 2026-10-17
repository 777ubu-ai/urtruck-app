import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('route map does not create a native user-location layer when hidden', () => {
  const map = readFileSync('src/components/TruckMap.native.js', 'utf8');
  const patch = readFileSync('patches/react-native-yamap+4.8.3.patch', 'utf8');
  assert.match(map, /showUserPosition=\{false\}/);
  assert.match(map, /followUser=\{false\}/);
  assert.match(patch, /fun setShowUserPosition\(show: Boolean\) \{\s*\+\s*\/\/[^\n]*\n\+[^\n]*\n\+\s*if \(!show && userLocationLayer == null\) return/);
});
