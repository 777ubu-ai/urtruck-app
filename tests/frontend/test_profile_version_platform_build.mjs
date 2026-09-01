import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const src = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');

test('Profile version label prefers native build version over Expo config', () => {
  assert.match(src, /Application\?\.nativeApplicationVersion/);
  assert.match(src, /Application\?\.nativeBuildVersion\s*\|\|\s*Constants\?\.nativeBuildVersion/s);
  assert.match(src, /Platform\.OS === 'ios'\s*\?\s*Constants\?\.expoConfig\?\.ios\?\.buildNumber\s*:\s*''/s);
  assert.doesNotMatch(
    src,
    /Constants\?\.expoConfig\?\.android\?\.versionCode/,
    'Android must not show the static app.json versionCode when Gradle overrides versionCode'
  );
});
