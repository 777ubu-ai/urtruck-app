import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.js', 'utf8');
const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;

test('Android separates the constrained native splash icon from the full-screen branded launch frame', () => {
  assert.equal(config.android.splash.image, './assets/icon.png');
  assert.equal(config.android.splash.backgroundColor, '#070B14');
  assert.match(app, /SplashScreen\.preventAutoHideAsync\(\)/);
  assert.match(app, /testID="android-branded-launch-splash"/);
  assert.match(app, /urtruck-splash\.png/);
  assert.match(app, /resizeMode="cover"/);
  assert.match(app, /ANDROID_BRANDED_SPLASH_MIN_MS/);
});

test('the in-app branded launch frame is Android-only and cannot block interaction after it finishes', () => {
  assert.match(app, /Platform\.OS === 'android'/);
  assert.match(app, /pointerEvents="none"/);
  assert.match(app, /setVisible\(false\)/);
});
