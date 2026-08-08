import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
const ios = fs.readFileSync('ios/UrTruck/Info.plist', 'utf8');
const android = fs.readFileSync('android/app/build.gradle', 'utf8');
const pbxproj = fs.readFileSync('ios/UrTruck.xcodeproj/project.pbxproj', 'utf8');
const androidManifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

const iosVersion = ios.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
const iosBuild = ios.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
const androidVersion = android.match(/versionName\s+["']([^"']+)["']/)?.[1];
const androidVersionCode = android.match(/versionCode\s+\(project\.hasProperty\('URTRUCK_VERSION_CODE'\)[\s\S]*?:\s*(\d+)\)/)?.[1];

assert.equal(iosVersion, app.version, `iOS version ${iosVersion} must match app.json ${app.version}`);
assert.equal(iosBuild, app.ios.buildNumber, `iOS build ${iosBuild} must match app.json ${app.ios.buildNumber}`);
assert.equal(androidVersion, app.version, `Android version ${androidVersion} must match app.json ${app.version}`);
assert.ok(Number(androidVersionCode) >= app.android.versionCode, `Android fallback versionCode ${androidVersionCode} must not be lower than app.json ${app.android.versionCode}`);

// P0-7 / P0-mobile-1 (08.08.2026): bare-workflow (ios/ и android/ закоммичены)
// НЕ запускает prebuild, поэтому app.json — документация, а не конфигурация.
// Guard раньше проверял только Info.plist + build.gradle и пропускал два
// расхождения, дававших ITMS-90062 и сломанный фоновый GPS. Теперь сверяем
// нативку напрямую.

// (1) project.pbxproj версии — если Xcode когда-нибудь включит
//     GENERATE_INFOPLIST_FILE, бинарь возьмёт версию отсюда, а не из plist.
const marketingVersions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
const projectVersions = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
assert.ok(marketingVersions.length > 0, 'MARKETING_VERSION not found in project.pbxproj');
for (const mv of marketingVersions) {
  assert.equal(mv, app.version, `pbxproj MARKETING_VERSION ${mv} must match app.json ${app.version} (ITMS-90062 landmine)`);
}
for (const pv of projectVersions) {
  assert.equal(pv, String(app.ios.buildNumber), `pbxproj CURRENT_PROJECT_VERSION ${pv} must match app.json build ${app.ios.buildNumber}`);
}

// (2) iOS фоновая локация — background mode 'location' обязателен для
//     трекинга машины во время рейса, иначе фича мертва в стор-сборке.
assert.ok(/<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<string>location<\/string>/.test(ios),
  "iOS Info.plist UIBackgroundModes must include 'location' (background trip tracking)");

// (3) Android фоновая локация + foreground-service — без них startForeground
//     для location-сервиса на Android 14+ (targetSdk 36) = SecurityException.
for (const perm of ['ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION']) {
  assert.ok(androidManifest.includes(`android.permission.${perm}`),
    `AndroidManifest must declare ${perm} (background trip tracking crashes without it on Android 14+)`);
}

console.log(`Release versions aligned: iOS ${iosVersion} (${iosBuild}), pbxproj ${marketingVersions.join('/')} (${projectVersions.join('/')}), Android ${androidVersion} (fallback ${androidVersionCode})`);
console.log('Native GPS parity OK: iOS UIBackgroundModes+location, Android BACKGROUND_LOCATION+FOREGROUND_SERVICE_LOCATION');
