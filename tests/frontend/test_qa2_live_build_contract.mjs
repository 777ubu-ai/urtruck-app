import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/build-android-apk.yml', 'utf8');

test('distributed QA2 restores live providers without embedding the isolated harness URL', () => {
  assert.ok(workflow.includes('EXPO_PUBLIC_API_URL=https://urtruck.kz'));
  assert.ok(!workflow.includes('EXPO_PUBLIC_API_URL=http://127.0.0.1:18001'));
  const version = Number(workflow.match(/URTRUCK_VERSION_CODE=(\d+)/)?.[1]);
  assert.ok(version > 211040055, 'never downgrade the installed physical candidate');
});

test('live QA2 keeps MapKit and Firebase secret injection and the isolated package', () => {
  assert.ok(workflow.includes('secrets.YANDEX_MAPKIT_API_KEY'));
  assert.ok(workflow.includes('YANDEX_MAPKIT_API_KEY is required'));
  assert.ok(workflow.includes('secrets.ANDROID_GOOGLE_SERVICES_JSON_BASE64'));
  assert.ok(workflow.includes('URTRUCK_EXPECTED_ANDROID_PACKAGE=com.urtruck.app.qa2'));
});
