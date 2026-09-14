import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');

test('Android release builds fail before bundling when the native MapKit key is absent', () => {
  assert.match(gradle, /System\.getenv\('EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY'\)/);
  assert.match(gradle, /isReleaseTask && !hasMapKitApiKey/);
  assert.match(gradle, /native QA2 MapKit renderer is compiled without YaMap\.init/);
});

test('debug builds remain usable without release-only MapKit credentials', () => {
  assert.match(gradle, /taskNames\.any \{ it\.toLowerCase\(\)\.contains\('release'\) \}/);
});
