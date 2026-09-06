import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
const ios = fs.readFileSync('ios/UrTruck/Info.plist', 'utf8');
const android = fs.readFileSync('android/app/build.gradle', 'utf8');
const playWorkflow = fs.readFileSync('.github/workflows/deploy-play.yml', 'utf8');

const iosVersion = ios.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
const iosBuild = ios.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
const androidVersion = android.match(/def configuredVersionName[\s\S]*?['"](1\.0\.8)['"]/)?.[1];
const androidVersionCode = android.match(/versionCode\s+\(configuredVersionCode\s*\?\s*configuredVersionCode\.toInteger\(\)\s*:\s*(\d+)\)/)?.[1];

assert.equal(iosVersion, app.version, `iOS version ${iosVersion} must match app.json ${app.version}`);
assert.equal(iosBuild, app.ios.buildNumber, `iOS build ${iosBuild} must match app.json ${app.ios.buildNumber}`);
assert.equal(androidVersion, app.version, `Android version ${androidVersion} must match app.json ${app.version}`);
assert.ok(Number(androidVersionCode) >= app.android.versionCode, `Android fallback versionCode ${androidVersionCode} must not be lower than app.json ${app.android.versionCode}`);
assert.match(android, /configuredVersionCode\s*=\s*project\.findProperty\(['"]URTRUCK_VERSION_CODE['"]\)/,
  'Android versionCode must be supplied through URTRUCK_VERSION_CODE when configured');
assert.match(android, /Release versionCode is not configured; set -PURTRUCK_VERSION_CODE/,
  'release builds must fail closed without an explicit versionCode');

// Google Play versionCode must not depend on a small workflow-local counter.
// A previous run-number-based scheme collided with an already-used Play code.
// The release workflow now serializes uploads and derives a monotonically
// growing code from wall-clock time, independent of workflow recreation and
// historical/manual version codes.
assert.match(playWorkflow, /group:\s*google-play-\$\{\{ github\.repository \}\}/, 'Play uploads must be serialized');
assert.match(playWorkflow, /cancel-in-progress:\s*false/, 'Play upload serialization must not cancel a release already uploading');
assert.match(playWorkflow, /base_epoch=1577836800/, 'Play versionCode must use the 2020 epoch baseline');
assert.match(playWorkflow, /version_code=\$\(\(now_epoch - base_epoch\)\)/, 'Play versionCode must derive from UTC epoch seconds');
assert.match(playWorkflow, /2100000000/, 'Play workflow must enforce the Android versionCode upper bound');
assert.match(playWorkflow, /Verify built AAB identity and versionCode/, 'Play workflow must verify the version embedded in the AAB');
assert.doesNotMatch(
  playWorkflow,
  /URTRUCK_VERSION_CODE=\$\(\(100 \+ GITHUB_RUN_NUMBER\)\)/,
  'Play workflow must not execute the collision-prone run-number formula',
);

console.log(`Release versions aligned: iOS ${iosVersion} (${iosBuild}), Android ${androidVersion} (fallback ${androidVersionCode}); Play versionCode contract guarded`);
