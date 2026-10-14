import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validatePlayReleaseInputs } from '../../scripts/validate-play-release-inputs.mjs';
import { assertProductionApkConfig } from '../../scripts/verify-production-apk-config.mjs';

for (const status of ['halted', 'inProgress']) {
  test(`${status} requires an explicit fraction`, () => {
    assert.throws(() => validatePlayReleaseInputs(status), /required/);
    for (const value of ['0', '1', '-0.1', '1.1', 'NaN', 'Infinity', '0x01', '0.2\nINJECTED=true']) {
      assert.throws(() => validatePlayReleaseInputs(status, value), /decimal/);
    }
  });
  test(`${status} retains the caller fraction without a fallback`, () => {
    assert.deepEqual(validatePlayReleaseInputs(status, '0.25'), { status, userFraction: '0.25' });
  });
}
for (const status of ['draft', 'completed']) {
  test(`${status} never gets an implicit fraction`, () => {
    assert.deepEqual(validatePlayReleaseInputs(status), { status, userFraction: '' });
    assert.throws(() => validatePlayReleaseInputs(status, '0.01'), /only allowed/);
  });
}
test('unknown status is rejected', () => assert.throws(() => validatePlayReleaseInputs('unknown'), /Unsupported/));
test('Play workflow uses validated fraction and records actual upload outcome', () => {
  const source = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
  assert.match(source, /node scripts\/validate-play-release-inputs\.mjs/);
  assert.match(source, /userFraction: \$\{\{ env\.PLAY_USER_FRACTION \}\}/);
  assert.match(source, /id: upload_to_play/);
  assert.match(source, /steps\.upload_to_play\.outcome/);
  assert.match(source, /upload requested/);
  assert.match(source, /upload outcome/);
});

test('manual production device-QA APK is opt-in, encrypted, release-signed, and never submits by itself', () => {
  const source = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
  assert.match(source, /build_installable_apk:[\s\S]*?default: false[\s\S]*?type: boolean/);
  assert.match(source, /installed_version_code=213720253/);
  assert.match(source, /Build signed production APK for device QA[\s\S]*?inputs\.build_installable_apk/);
  assert.match(source, /name: Build release AAB\n        if: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| !inputs\.build_installable_apk \|\| inputs\.submit_to_play \}\}/);
  assert.match(source, /EXPO_PUBLIC_API_URL: https:\/\/urtruck\.kz/);
  assert.match(source, /app-release\.apk[\s\S]*?aapt[\s\S]*?com\.urtruck\.app/);
  assert.match(source, /unzip -p "\$apk" assets\/app\.config/);
  assert.match(source, /node scripts\/verify-production-apk-config\.mjs/);
  assert.doesNotMatch(source, /index\.android\.bundle \| grep -aq 'qa2\.urtruck\.kz'/);
  assert.match(source, /apksigner" verify --print-certs/);
  assert.match(source, /Encrypt production APK for private device transfer[\s\S]*?openssl enc -aes-256-cbc[\s\S]*?openssl dgst -sha256 -mac HMAC[\s\S]*?openssl pkeyutl -encrypt/);
  assert.ok(existsSync('.github/keys/device-qa-apk-encryption.pub'));
  assert.match(source, /Upload encrypted production APK for local device QA[\s\S]*?UrTruck-production-apk-device-qa-encrypted/);
  assert.doesNotMatch(source, /path: android\/app\/build\/outputs\/apk\/release\/app-release\.apk/);
  assert.match(source, /apk_sha=.*shasum -a 256/);
  assert.match(source, /artifact kind: \\`\$\{artifact_kind\}\\`/);
  assert.match(source, /github\.event_name != 'workflow_dispatch' \|\| inputs\.submit_to_play/);
  assert.match(source, /github\.event_name == 'workflow_dispatch' && inputs\.build_installable_apk/);
});

test('production APK config verifier accepts only embedded production API, flavor, and package', () => {
  const production = {
    android: { package: 'com.urtruck.app' },
    extra: { urtruckApiUrl: 'https://urtruck.kz/', urtruckBuildFlavor: 'production' },
  };
  assert.doesNotThrow(() => assertProductionApkConfig(production));
  assert.throws(() => assertProductionApkConfig({
    ...production,
    extra: { ...production.extra, urtruckApiUrl: 'https://qa2.urtruck.kz' },
  }), /API config must be https:\/\/urtruck\.kz/);
  assert.throws(() => assertProductionApkConfig({
    ...production,
    extra: { ...production.extra, urtruckBuildFlavor: 'qa2' },
  }), /flavor must be production/);
  assert.throws(() => assertProductionApkConfig({
    ...production,
    android: { package: 'com.urtruck.app.qa2' },
  }), /package must be com\.urtruck\.app/);
});
