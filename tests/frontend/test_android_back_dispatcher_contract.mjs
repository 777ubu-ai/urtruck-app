import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Android native back dispatcher keeps RN BackHandler active', () => {
  const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  assert.ok(app.expo.plugins.includes('./plugins/withAndroidBackCompatibility'));

  const plugin = fs.readFileSync('plugins/withAndroidBackCompatibility.js', 'utf8');
  assert.match(plugin, /withAndroidManifest/);
  assert.match(plugin, /enableOnBackInvokedCallback/);
  assert.match(plugin, /false/);
});
