import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const strings = fs.readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const workflow = fs.readFileSync('.github/workflows/deploy-play.yml', 'utf8');

assert.equal(app.name, 'UrTruck Pro Test');
assert.equal(app.android.package, 'com.urtruck.protest');
assert.equal(app.ios.bundleIdentifier, 'com.urtruck.protest');
assert.equal(app.scheme, 'urtruck-pro-test');
assert.match(gradle, /applicationId 'com\.urtruck\.protest'/);
assert.match(strings, />UrTruck Pro Test</);
assert.match(manifest, /android:scheme="com\.urtruck\.protest"/);
assert.match(manifest, /android:scheme="urtruck-pro-test"/);
assert.match(workflow, /packageName: com\.urtruck\.protest/);
assert.match(workflow, /tracks: internal/);
assert.doesNotMatch(workflow, /tracks:.*production/);
assert.match(workflow, /PRO_TEST_API_URL/);
assert.match(workflow, /PRO_TEST_ANDROID_GOOGLE_SERVICES_JSON_BASE64/);

console.log('pro-test-identity-contract OK');
