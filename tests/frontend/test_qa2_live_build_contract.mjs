import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/build-android-apk.yml', 'utf8');
const testflightWorkflow = readFileSync('.github/workflows/testflight-rc.yml', 'utf8');
const playWorkflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');

test('distributed QA2 restores live providers without embedding the isolated harness URL', () => {
  assert.ok(workflow.includes('EXPO_PUBLIC_API_URL=https://urtruck.kz'));
  assert.ok(!workflow.includes('EXPO_PUBLIC_API_URL=http://127.0.0.1:18001'));
  const version = Number(workflow.match(/URTRUCK_VERSION_CODE=(\d+)/)?.[1]);
  assert.ok(version > 211040069, 'never reuse or downgrade the latest QA2 candidate');
});

test('live QA2 keeps MapKit and Firebase secret injection and the isolated package', () => {
  assert.ok(workflow.includes('secrets.YANDEX_MAPKIT_API_KEY'));
  assert.ok(workflow.includes('YANDEX_MAPKIT_API_KEY is required'));
  assert.ok(workflow.includes('secrets.ANDROID_GOOGLE_SERVICES_JSON_BASE64'));
  assert.ok(workflow.includes("play-services-location:21.3.0"));
  assert.ok(!workflow.includes("play-services-location:21.0.1"));
  assert.ok(workflow.includes('URTRUCK_EXPECTED_ANDROID_PACKAGE=com.urtruck.app.qa2'));
});

test('TestFlight accepts the canonical Border QA branch and still rejects arbitrary refs', () => {
  assert.ok(testflightWorkflow.includes('main|qa/master-hard-qa-20260916|fix/cgr-border-deal-integration-20260919'));
  assert.ok(testflightWorkflow.includes('TestFlight RC may only be built from main or an approved canonical QA branch.'));
  assert.ok(testflightWorkflow.includes('npx eas-cli@latest build:view "$BUILD_ID" --json'));
});

test('Play workflow can build a signed AAB without submitting and records release identity', () => {
  assert.ok(playWorkflow.includes('submit_to_play:'));
  assert.ok(playWorkflow.includes("github.event_name != 'workflow_dispatch' || inputs.submit_to_play"));
  assert.ok(playWorkflow.includes('uses: actions/upload-artifact@v4'));
  assert.ok(playWorkflow.includes('AAB SHA-256=${aab_sha}'));
  assert.ok(playWorkflow.includes('Upload certificate SHA-256=${cert_sha}'));
});
