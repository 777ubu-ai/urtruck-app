import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/RouteMap.js', 'utf8');

test('fullscreen map keeps its controls below the Android status bar', () => {
  assert.match(source, /import \{ SafeAreaView \} from 'react-native-safe-area-context'/);
  assert.match(source, /edges=\{\['top', 'left', 'right'\]\}/);
  assert.match(source, /width: 48, height: 48/);
  assert.match(source, /hitSlop=\{8\}/);
});

test('fullscreen map has one close action for gesture, modal and Android hardware Back', () => {
  assert.match(source, /const closeRoute = React\.useCallback\(\(\) => setRouteOpen\(false\), \[\]\)/);
  assert.match(source, /onRequestClose=\{closeRoute\}/);
  assert.match(source, /onPress=\{closeRoute\}/);
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /closeRoute\(\);\s*return true/);
});
