import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
const ios = fs.readFileSync('ios/UrTruck/Info.plist', 'utf8');
const android = fs.readFileSync('android/app/build.gradle', 'utf8');

const iosVersion = ios.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
const iosBuild = ios.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
const androidVersion = android.match(/versionName\s+["']([^"']+)["']/)?.[1];
const androidVersionCode = android.match(/versionCode\s+\(project\.hasProperty\('URTRUCK_VERSION_CODE'\)[\s\S]*?:\s*(\d+)\)/)?.[1];

assert.equal(iosVersion, app.version, `iOS version ${iosVersion} must match app.json ${app.version}`);
assert.equal(iosBuild, app.ios.buildNumber, `iOS build ${iosBuild} must match app.json ${app.ios.buildNumber}`);
assert.equal(androidVersion, app.version, `Android version ${androidVersion} must match app.json ${app.version}`);
assert.equal(Number(androidVersionCode), app.android.versionCode, `Android versionCode ${androidVersionCode} must match app.json ${app.android.versionCode}`);

console.log(`Release versions aligned: iOS ${iosVersion} (${iosBuild}), Android ${androidVersion} (${androidVersionCode})`);
