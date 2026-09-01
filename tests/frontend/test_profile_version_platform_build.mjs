import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const src = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');

test('Profile version label uses platform-specific build fallback', () => {
  assert.match(src, /Platform\.OS === 'ios'\s*\?\s*Constants\?\.expoConfig\?\.ios\?\.buildNumber\s*:\s*Constants\?\.expoConfig\?\.android\?\.versionCode/s);
  assert.doesNotMatch(
    src,
    /Constants\?\.nativeBuildVersion\s*\|\|\s*Constants\?\.expoConfig\?\.ios\?\.buildNumber\s*\|\|\s*Constants\?\.expoConfig\?\.android\?\.versionCode/,
    'Android must not show the iOS buildNumber when nativeBuildVersion is absent'
  );
});
