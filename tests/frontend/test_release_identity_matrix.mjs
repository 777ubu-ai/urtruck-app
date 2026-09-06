import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const qaWorkflow = fs.readFileSync('.github/workflows/build-android-qa2.yml', 'utf8');
const iosWorkflow = fs.readFileSync('.github/workflows/testflight-rc-internal.yml', 'utf8');
const entitlements = fs.readFileSync('ios/UrTruck/UrTruck.entitlements', 'utf8');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;

test('QA2 is isolated from production upload signing', () => {
  assert.match(qaWorkflow, /QA2_APPLICATION_ID: com\.urtruck\.app\.qa2/);
  assert.match(qaWorkflow, /ANDROID_QA2_GOOGLE_SERVICES_JSON_BASE64/);
  assert.match(qaWorkflow, /QA2_CERT_SHA256: fac61745/);
  assert.match(qaWorkflow, /assembleDebug/);
  assert.match(gradle, /QA2 must use the stable QA\/debug signing lineage/);
  assert.match(gradle, /QA2 cannot be assembled as a release artifact/);
  assert.match(gradle, /signingConfig signingConfigs\.debug/);
});

test('internal TestFlight workflow is manually controlled and exact-SHA bound', () => {
  assert.match(iosWorkflow, /workflow_dispatch:/);
  assert.match(iosWorkflow, /source_ref:/);
  assert.match(iosWorkflow, /gitCommitHash/);
  assert.match(iosWorkflow, /internal_testflight_only/);
  assert.doesNotMatch(iosWorkflow, /branches:\s*\[?main/);
});

test('Apple Sign In source configuration has its release entitlement', () => {
  assert.equal(app.ios.usesAppleSignIn, true);
  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(entitlements, /<string>Default<\/string>/);
});
