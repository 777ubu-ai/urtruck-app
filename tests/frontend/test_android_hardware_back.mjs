import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.js', 'utf8');

test('Android hardware Back pops the canonical navigation stack before Activity exit', () => {
  assert.match(app, /BackHandler.*from ['"]react-native['"]/);
  assert.match(app, /BackHandler\.addEventListener\(['"]hardwareBackPress['"], onHardwareBackPress\)/);
  assert.match(app, /navigator\?\.isReady\?\.\(\).*navigator\.canGoBack\(\)/);
  assert.match(app, /navigator\.goBack\(\)/);
  assert.match(app, /return true;/);
  assert.match(app, /return false;/);
});
