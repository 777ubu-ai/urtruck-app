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

test('native MapKit releases views and pauses location listeners off screen', () => {
  const patch = readFileSync('patches/react-native-yamap+4.8.3.patch', 'utf8');
  assert.match(patch, /override fun onDropViewInstance\(view: YamapView\)/);
  assert.match(patch, /override fun onDropViewInstance\(view: ClusteredYamapView\)/);
  assert.match(patch, /override fun onHostPause\(\) = MapKitViewLifecycle\.pause\(\)/);
  assert.match(patch, /fun remove\(view: MapView\)/);
  assert.match(patch, /view\.onStop\(\)/);
  assert.match(patch, /MapKitFactory\.getInstance\(\)\.onStop\(\)/);
});


test('iOS false location props не создают скрытый слой геолокации', () => {
  const patch = readFileSync('patches/react-native-yamap+4.8.3.patch', 'utf8');
  const ios = patch.slice(patch.indexOf('diff --git a/node_modules/react-native-yamap/ios/View/RNYMView.m'));
  assert.ok(ios.startsWith('diff --git'), 'нужен iOS patch, одного Android исправления недостаточно');
  assert.match(ios, /setListenUserLocation:\(BOOL\) listen \{[\s\S]*?\+\s*if \(!listen && userLayer == nil\) return;/);
  assert.match(ios, /setFollowUser:\(BOOL\)follow \{[\s\S]*?\+\s*if \(!follow && userLayer == nil\) return;/);
});
