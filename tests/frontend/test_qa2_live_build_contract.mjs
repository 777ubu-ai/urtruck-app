import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const qa2AndroidMetadata = require('../../config/qa2-android-build-metadata');
const workflow = readFileSync('.github/workflows/build-android-apk.yml', 'utf8');
const testflightWorkflow = readFileSync('.github/workflows/testflight-rc.yml', 'utf8');
const playWorkflow = readFileSync('.github/workflows/deploy-play.yml', 'utf8');
const iosPodfile = readFileSync('ios/Podfile', 'utf8');
const iosPodProperties = readFileSync('ios/Podfile.properties.json', 'utf8');
const iosProject = readFileSync('ios/UrTruck.xcodeproj/project.pbxproj', 'utf8');
const androidAppBuild = readFileSync('android/app/build.gradle', 'utf8');

test('distributed QA2 requires a healthy non-production API target', () => {
  assert.ok(workflow.includes('QA2_API_URL: ${{ secrets.QA2_API_URL }}'));
  assert.ok(workflow.includes('QA2 Android build must not target production'));
  assert.ok(workflow.includes('urtruck.kz|www.urtruck.kz|185.22.65.11'));
  assert.ok(workflow.includes('for path in /health /api/version'));
  assert.ok(workflow.includes("printf 'EXPO_PUBLIC_API_URL=%s\\n' \"$QA_API_URL\""));
  assert.ok(!workflow.includes('EXPO_PUBLIC_API_URL=https://urtruck.kz'));
  assert.ok(!workflow.includes('EXPO_PUBLIC_API_URL=http://127.0.0.1:18001'));
  assert.ok(workflow.includes('enable_external_freight_feed:'), 'QA-only build must expose an explicit feed flag');
  assert.ok(workflow.includes('default: false'), 'feed must remain disabled in normal QA2 candidates');
  assert.ok(workflow.includes('test "$API_TARGET" = "qa2"'), 'feed cannot be enabled against loopback or production');
  assert.ok(workflow.includes('EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED=true'));
});

test('loopback lab APK mode is explicit, exact-source guarded, and cannot target production', () => {
  assert.ok(workflow.includes('api_target:'));
  assert.ok(workflow.includes('- loopback_lab'));
  assert.ok(workflow.includes('BUILD_OPPO_LOOPBACK_LAB'));
  assert.ok(workflow.includes('git merge-base --is-ancestor 6bf713eac1f9c7339b8651fecc132aa14f7862e5 "$RESOLVED_SOURCE_SHA"'));
  assert.ok(workflow.includes('fetch-depth: 0'), 'the ancestry guard must have repository history to inspect');
  assert.ok(workflow.includes('QA_API_URL="http://127.0.0.1:8002"'));
  assert.ok(workflow.includes('adb reverse tcp:8002 tcp:8002'));
  assert.ok(workflow.includes('QA2 Android build must not target production'));
  assert.ok(workflow.includes('Loopback API is allowed only in explicit loopback_lab mode'));
  assert.ok(workflow.includes('YANDEX_MAPKIT_API_KEY is required'));
  assert.ok(workflow.includes('QA2_ANDROID_GOOGLE_SERVICES_JSON_BASE64'));
  assert.ok(workflow.includes('URTRUCK_EXPECTED_ANDROID_PACKAGE=com.urtruck.app.qa2'));
  assert.ok(workflow.includes('sourceSHA=${URTRUCK_SOURCE_SHA}'));
});

test('QA086 checks out and records an explicitly supplied exact source SHA', () => {
  const sourceInput = workflow.match(/source_ref:\n([\s\S]*?)\n\s+api_target:/)?.[1] || '';
  assert.ok(sourceInput.includes('required: true'));
  assert.ok(!sourceInput.includes('default:'), 'QA2 build must not silently reuse a stale source SHA');
  assert.ok(workflow.includes('ref: ${{ inputs.source_ref || github.sha }}'));
  assert.ok(workflow.includes('test "$RESOLVED_SOURCE_SHA" = "$EXPECTED_SOURCE_SHA"'));
  assert.ok(workflow.includes("require('./config/qa2-android-build-metadata')"));
  assert.ok(workflow.includes("process.stdout.write([metadata.QA2_ANDROID_VERSION_CODE, metadata.QA2_ANDROID_PREVIOUS_VERSION_CODE].join(' ') + '\\\\n')"), 'metadata line must terminate so bash read succeeds under set -e');
  assert.ok(workflow.includes('QA2 Android versionCode must be greater than the previous QA2 APK'));
  assert.ok(!workflow.includes('211040090'), 'workflow must not silently rebuild the previous QA2 APK');
  assert.ok(workflow.includes('sourceSHA=${URTRUCK_SOURCE_SHA}'));
  assert.ok(workflow.includes('URTRUCK_VERSION_NAME=1.0.12-qa2'), 'QA2 artifact must carry an explicit -qa2 versionName');
});

test('QA2 Android config carries explicit qa2 versionName', () => {
  const output = execFileSync(
    process.execPath,
    ['-e', "const config = require('./app.config.js')({ config: { version: '1.0.9', android: {}, extra: {} } }); process.stdout.write(String(config.version));"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        URTRUCK_BUILD_FLAVOR: 'qa2',
        URTRUCK_VERSION_NAME: '1.0.12-qa2',
        URTRUCK_VERSION_CODE: String(qa2AndroidMetadata.QA2_ANDROID_VERSION_CODE),
        EXPO_PUBLIC_API_URL: 'https://qa2.example.test',
      },
    },
  ).toString();

  assert.equal(output, '1.0.12-qa2');
});

test('QA2 Android APK versionCode is sourced from config and is newer than the installed baseline', () => {
  const output = execFileSync(
    process.execPath,
    ['-e', "const config = require('./app.config.js')({ config: { android: {}, extra: {} } }); process.stdout.write(String(config.android.versionCode));"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        URTRUCK_BUILD_FLAVOR: 'qa2',
        URTRUCK_VERSION_CODE: String(qa2AndroidMetadata.QA2_ANDROID_VERSION_CODE),
        EXPO_PUBLIC_API_URL: 'https://qa2.example.test',
      },
    },
  ).toString();

  assert.equal(Number(output), qa2AndroidMetadata.QA2_ANDROID_VERSION_CODE);
  assert.ok(
    qa2AndroidMetadata.QA2_ANDROID_VERSION_CODE
      > qa2AndroidMetadata.QA2_ANDROID_PREVIOUS_VERSION_CODE,
  );
});

test('live QA2 keeps MapKit and Firebase secret injection and the isolated package', () => {
  assert.ok(workflow.includes('secrets.YANDEX_MAPKIT_API_KEY'));
  assert.ok(workflow.includes('YANDEX_MAPKIT_API_KEY is required'));
  assert.ok(workflow.includes('secrets.QA2_ANDROID_GOOGLE_SERVICES_JSON_BASE64'));
  assert.ok(!workflow.includes('secrets.ANDROID_GOOGLE_SERVICES_JSON_BASE64'));
  assert.ok(workflow.includes("play-services-location:21.3.0"));
  assert.ok(!workflow.includes("play-services-location:21.0.1"));
  assert.ok(workflow.includes('URTRUCK_EXPECTED_ANDROID_PACKAGE=com.urtruck.app.qa2'));
});

test('QA2 Android build reinstalls its pinned NDK after disk cleanup', () => {
  const cleanup = workflow.indexOf('/usr/local/lib/android/sdk/ndk');
  const install = workflow.indexOf('sdkmanager "ndk;27.1.12297006"');
  assert.ok(cleanup >= 0, 'workflow must declare NDK cleanup explicitly');
  assert.ok(install > cleanup, 'required NDK must be installed after cleanup');
});

test('explicit QA release stays in the isolated QA2 package', () => {
  assert.ok(androidAppBuild.includes("project.hasProperty('URTRUCK_QA2')"));
  assert.ok(androidAppBuild.includes('applicationIdSuffix ".qa2"'));
  assert.ok(androidAppBuild.includes('versionNameSuffix "-qa2"'));
  assert.ok(androidAppBuild.includes("URTRUCK_ALLOW_DEBUG_SIGNED_RELEASE"));
});

test('TestFlight uses a protected exact-SHA QA2 trigger and never the production API', () => {
  assert.ok(testflightWorkflow.includes('environment: qa2'));
  assert.ok(testflightWorkflow.includes('test "$GITHUB_REF_NAME" = qa2/integration-candidate'));
  assert.ok(testflightWorkflow.includes('QA_SOURCE_SHA: ${{ inputs.source_sha }}'));
  assert.ok(testflightWorkflow.includes('test "$(git rev-parse HEAD)" = "$QA_SOURCE_SHA"'));
  assert.ok(testflightWorkflow.includes('pulls/605'));
  assert.ok(testflightWorkflow.includes(".merge_commit_sha' <<<\"$PR_JSON\")"));
  assert.doesNotMatch(testflightWorkflow, /pulls\/605\/reviews|Current independent approval/);
  assert.ok(testflightWorkflow.includes('commits/$PR_HEAD_SHA/check-runs'));
  assert.ok(testflightWorkflow.includes("'quality-gate / Backend tests'"));
  assert.ok(testflightWorkflow.includes("'quality-gate / Frontend tests, lint, and build'"));
  assert.ok(testflightWorkflow.includes("'quality-gate / Mandatory web E2E subset'"));
  assert.doesNotMatch(workflow, /pulls\/605\/reviews|Current independent approval/);
  assert.ok(!testflightWorkflow.includes("'qa2-final-testflight-*'"));
  assert.ok(!testflightWorkflow.includes('push:\n    branches:'));
  assert.ok(testflightWorkflow.includes('BUILD_QA2_TESTFLIGHT'));
  assert.ok(testflightWorkflow.includes('URTRUCK_MIN_IOS_BUILD: ${{ inputs.last_verified_ios_build }}'));
  assert.ok(testflightWorkflow.includes('QA2_API_URL: ${{ secrets.QA2_API_URL }}'));
  assert.ok(testflightWorkflow.includes('test "$QA_HOST" = qa2.urtruck.kz'));
  assert.ok(!testflightWorkflow.includes('EXPO_PUBLIC_API_URL: https://urtruck.kz'));
  assert.ok(testflightWorkflow.includes('test "$BUILD_NUMBER" -gt "$URTRUCK_MIN_IOS_BUILD"'));
  assert.ok(testflightWorkflow.includes('bundleIdentifier=$BUNDLE_ID'));
});

test('Expo SDK 57 native iOS project uses the required deployment target and architecture', () => {
  assert.ok(iosPodfile.includes("podfile_properties['ios.deploymentTarget'] || '16.4'"));
  assert.equal(JSON.parse(iosPodProperties)['ios.deploymentTarget'], '16.4');
  assert.equal(JSON.parse(iosPodProperties).newArchEnabled, 'true');
  assert.ok(!iosProject.includes('IPHONEOS_DEPLOYMENT_TARGET = 15.1;'));
  assert.equal((iosProject.match(/IPHONEOS_DEPLOYMENT_TARGET = 16.4;/g) || []).length, 4);
});

test('Play workflow can build a signed AAB without submitting and records release identity', () => {
  assert.ok(playWorkflow.includes('submit_to_play:'));
  assert.ok(playWorkflow.includes('QA2 internal candidates may only be built from the reviewed integration-candidate branch'));
  assert.doesNotMatch(playWorkflow, /pulls\/605\/reviews|Current independent approval/);
  assert.ok(playWorkflow.includes("github.event_name != 'workflow_dispatch' || inputs.submit_to_play"));
  assert.ok(playWorkflow.includes('uses: actions/upload-artifact@v4'));
  assert.ok(playWorkflow.includes('AAB SHA-256=${aab_sha}'));
  assert.ok(playWorkflow.includes('Upload certificate SHA-256=${cert_sha}'));
});


test('TestFlight SHA guard исполняется штатным Bash macOS без Bash 4 substitutions', () => {
  const guard = testflightWorkflow.split('\n').filter(line =>
    line.includes('test "$QA_SOURCE_SHA"') || line.includes('[[ "$QA_SOURCE_SHA" =~')).map(line => line.trim()).join('\n');
  assert.ok(guard.includes('^[0-9a-f]{40}$'));
  for (const sha of ['41a2ae6afd92b0f86708e828a2664e41d3600f7e', 'UPPERCASE', 'abc', '']) {
    const run = () => execFileSync('/bin/bash', ['-c', 'set -e\n' + guard], {
      env: { ...process.env, QA_SOURCE_SHA: sha }, stdio: 'pipe',
    });
    if (/^[0-9a-f]{40}$/.test(sha)) assert.doesNotThrow(run);
    else assert.throws(run);
  }
  assert.doesNotMatch(guard, /\$\{QA_SOURCE_SHA,,\}/);
});
