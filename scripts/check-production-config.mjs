import { readFileSync } from 'node:fs';

const beta = process.env.EXPO_PUBLIC_IS_BETA;
const profile = process.env.EAS_BUILD_PROFILE || process.env.EAS_PROFILE || '';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const appConfig = read('app.config.js');
const infoPlist = read('ios/UrTruck/Info.plist');
const xcodeProject = read('ios/UrTruck.xcodeproj/project.pbxproj');
const androidAppGradle = read('android/app/build.gradle');
const androidRootGradle = read('android/build.gradle');

const fail = (message) => {
  console.error(`[release-gate] ${message}`);
  process.exitCode = 1;
};
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) fail(message);
};
const requireEqual = (actual, expected, message) => {
  if (actual !== expected) fail(`${message}: expected ${expected}, got ${actual}`);
};

if (profile === 'production' && beta !== 'false') {
  fail('production requires EXPO_PUBLIC_IS_BETA=false');
}

requireEqual(app.ios.bundleIdentifier, 'com.urtruck.app', 'unexpected iOS bundle identifier');
requireEqual(app.android.package, 'com.urtruck.app', 'unexpected Android application id');
requireEqual(app.scheme, 'urtruck', 'unexpected deep-link scheme');
requireMatch(appConfig, /existsSync\(androidConfig\.googleServicesFile\)[\s\S]+delete androidConfig\.googleServicesFile/, 'credential-free config must omit an absent Firebase file');
requireMatch(xcodeProject, new RegExp(`MARKETING_VERSION = ${app.version.replaceAll('.', '\\.')};`, 'g'), 'Xcode marketing version differs from app.json');
requireMatch(xcodeProject, new RegExp(`CURRENT_PROJECT_VERSION = ${app.ios.buildNumber};`, 'g'), 'Xcode build number differs from app.json');
requireMatch(xcodeProject, /PRODUCT_BUNDLE_IDENTIFIER = com\.urtruck\.app;/g, 'Xcode bundle identifier is incorrect');
requireMatch(infoPlist, new RegExp(`<string>${app.version.replaceAll('.', '\\.')}</string>`), 'Info.plist version differs from app.json');
requireMatch(infoPlist, new RegExp(`<string>${app.ios.buildNumber}</string>`), 'Info.plist build differs from app.json');

for (const key of [
  'NSCameraUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSMotionUsageDescription',
  'NSPhotoLibraryUsageDescription',
]) {
  requireMatch(infoPlist, new RegExp(`<key>${key}</key>\\s*<string>[^<]+</string>`), `Info.plist is missing ${key}`);
  if (!app.ios.infoPlist[key]) fail(`app.json is missing ${key}`);
}
requireMatch(infoPlist, /<string>remote-notification<\/string>/, 'iOS remote notification background mode is missing');
requireMatch(infoPlist, /<string>location<\/string>/, 'iOS background location mode is missing');

requireMatch(androidAppGradle, /applicationId ['"]com\.urtruck\.app['"]/, 'Android application id is incorrect');
requireMatch(androidAppGradle, new RegExp(`versionName ["']${app.version.replaceAll('.', '\\.')}["']`), 'Android version name differs from app.json');
requireMatch(androidAppGradle, /URTRUCK_VERSION_CODE/, 'Android version code override is missing');
requireMatch(androidAppGradle, /applicationIdSuffix ['"]\.qa2['"]/, 'isolated QA2 application id is missing');
requireMatch(androidRootGradle, /com\.google\.gms:google-services/, 'Firebase Gradle plugin dependency is missing');
requireMatch(androidAppGradle, /apply plugin: ["']com\.google\.gms\.google-services["']/, 'Firebase Gradle plugin wiring is missing');
requireMatch(androidAppGradle, /releaseTaskRequested[\s\S]+URTRUCK_UPLOAD_STORE_FILE[\s\S]+URTRUCK_ALLOW_DEBUG_SIGNED_RELEASE/, 'release signing is not fail-closed');

if (!process.exitCode) {
  console.log(`[release-gate] native config parity PASS; version=${app.version}; ios=${app.ios.buildNumber}; android=${app.android.versionCode}`);
  console.log(`[release-gate] profile=${profile || 'unspecified'} EXPO_PUBLIC_IS_BETA=${beta ?? 'unset'}`);
}
