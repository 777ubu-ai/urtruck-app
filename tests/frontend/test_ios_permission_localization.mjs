// test_ios_permission_localization — PR #255 review item A.
//
// "PR #255 changed files do not include InfoPlist.strings / locale .lproj
//  resources, while ios/UrTruck/Info.plist and app.json permission
//  descriptions remain Russian-only (camera, microphone, photos,
//  WhenInUse/Always location). For ZH/EN/KK users, Apple system permission
//  dialogs must not display Russian."
//
// Apple resolves NS*UsageDescription against the app's localizations, so the
// fix is a per-locale InfoPlist.strings. This test locks in the whole chain:
// the files exist, cover every permission key, are actually non-Russian for
// EN/ZH, and are wired into the Xcode project so they land in the built app.
//
// It cannot prove the archive contains them — that needs xcodebuild on macOS
// and is tracked as the standing Phase 4 blocker.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LOCALES = ['ru', 'en', 'zh-Hans', 'kk'];
const PERMISSION_KEYS = [
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationAlwaysUsageDescription',
];
const CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
const CJK = /[㐀-䶿一-鿿]/;
const KAZAKH_ONLY = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

function parseStrings(file) {
  let src = fs.readFileSync(file, 'utf8');
  // strip /* ... */ block comments (may span lines) and // line comments
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = {};
  const re = /"([^"]+)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;
  for (const m of src.matchAll(re)) out[m[1]] = m[2];
  // nothing outside key="value"; pairs should remain
  const leftover = src.replace(re, '').trim();
  return { out, leftover };
}

const parsed = {};
for (const loc of LOCALES) {
  const file = `ios/UrTruck/${loc}.lproj/InfoPlist.strings`;
  test(`${loc}.lproj/InfoPlist.strings exists and parses cleanly`, () => {
    assert.ok(fs.existsSync(file), `${file} must exist`);
    const { out, leftover } = parseStrings(file);
    assert.equal(leftover, '', `unexpected content outside key="value"; pairs:\n${leftover}`);
    parsed[loc] = out;
  });
}

test('every permission key is localized in all four locales', () => {
  for (const loc of LOCALES) {
    const { out } = parseStrings(`ios/UrTruck/${loc}.lproj/InfoPlist.strings`);
    for (const key of PERMISSION_KEYS) {
      assert.ok(out[key] && out[key].trim().length > 10,
        `${loc} is missing a real value for ${key}`);
    }
  }
});

test('EN permission dialogs contain no Cyrillic', () => {
  const { out } = parseStrings('ios/UrTruck/en.lproj/InfoPlist.strings');
  for (const key of PERMISSION_KEYS) {
    assert.ok(!CYRILLIC.test(out[key]), `EN ${key} still Russian: ${out[key]}`);
    assert.match(out[key], /[A-Za-z]/, `EN ${key} has no Latin text`);
  }
});

test('ZH permission dialogs contain no Cyrillic and use Chinese', () => {
  const { out } = parseStrings('ios/UrTruck/zh-Hans.lproj/InfoPlist.strings');
  for (const key of PERMISSION_KEYS) {
    assert.ok(!CYRILLIC.test(out[key]), `ZH ${key} still Russian: ${out[key]}`);
    assert.ok(CJK.test(out[key]), `ZH ${key} is not Chinese: ${out[key]}`);
  }
});

test('KK permission dialogs use Kazakh, not raw Russian', () => {
  const kk = parseStrings('ios/UrTruck/kk.lproj/InfoPlist.strings').out;
  const ru = parseStrings('ios/UrTruck/ru.lproj/InfoPlist.strings').out;
  for (const key of PERMISSION_KEYS) {
    assert.notEqual(kk[key], ru[key], `KK ${key} is a verbatim copy of the Russian string`);
    assert.ok(KAZAKH_ONLY.test(kk[key]),
      `KK ${key} has no Kazakh-specific letter, likely raw Russian: ${kk[key]}`);
  }
});

test('Info.plist declares the localizations', () => {
  const plist = fs.readFileSync('ios/UrTruck/Info.plist', 'utf8');
  assert.match(plist, /<key>CFBundleLocalizations<\/key>/);
  for (const loc of LOCALES) {
    assert.match(plist, new RegExp(`<string>${loc}</string>`), `CFBundleLocalizations missing ${loc}`);
  }
  assert.match(plist, /<key>CFBundleAllowMixedLocalizations<\/key>\s*<true\/>/);
});

test('Xcode project bundles InfoPlist.strings as a localized resource', () => {
  const pbx = fs.readFileSync('ios/UrTruck.xcodeproj/project.pbxproj', 'utf8');

  // a PBXVariantGroup named InfoPlist.strings must exist
  const vg = pbx.match(/^\t\t([0-9A-F]{24}) \/\* InfoPlist\.strings \*\/ = \{\n\t\t\tisa = PBXVariantGroup;/m);
  assert.ok(vg, 'PBXVariantGroup for InfoPlist.strings is missing');

  // it must be referenced by a build file that is in the Resources phase
  const bf = pbx.match(/^\t\t([0-9A-F]{24}) \/\* InfoPlist\.strings in Resources \*\/ = \{isa = PBXBuildFile; fileRef = ([0-9A-F]{24})/m);
  assert.ok(bf, 'PBXBuildFile for InfoPlist.strings is missing');
  assert.equal(bf[2], vg[1], 'build file must point at the variant group');
  assert.ok(pbx.includes(`${bf[1]} /* InfoPlist.strings in Resources */,`),
    'InfoPlist.strings is not listed in the Resources build phase');

  // each locale file must be referenced with the right path
  for (const loc of LOCALES) {
    assert.ok(pbx.includes(`path = "${loc}.lproj/InfoPlist.strings"`),
      `pbxproj has no file reference for ${loc}.lproj/InfoPlist.strings`);
  }

  // knownRegions must list them, otherwise Xcode ignores the .lproj dirs
  const known = pbx.match(/knownRegions = \(([\s\S]*?)\);/);
  assert.ok(known, 'knownRegions block missing');
  for (const loc of ['ru', 'kk']) {
    assert.match(known[1], new RegExp(`\\b${loc},`), `knownRegions missing ${loc}`);
  }
  assert.match(known[1], /"zh-Hans",/, 'knownRegions missing zh-Hans');
});

test('pbxproj has no dangling or duplicate UUIDs after the edit', () => {
  const pbx = fs.readFileSync('ios/UrTruck.xcodeproj/project.pbxproj', 'utf8');
  const defined = [...pbx.matchAll(/^\t\t([0-9A-F]{24}) /gm)].map((m) => m[1]);
  const dupes = defined.filter((u, i) => defined.indexOf(u) !== i);
  assert.deepEqual([...new Set(dupes)], [], 'duplicate UUID definitions');

  const used = new Set([...pbx.matchAll(/\b([0-9A-F]{24})\b/g)].map((m) => m[1]));
  const rootObject = pbx.match(/rootObject = ([0-9A-F]{24})/)?.[1];
  const dangling = [...used].filter((u) => !defined.includes(u) && u !== rootObject);
  assert.deepEqual(dangling, [], `UUIDs referenced but never defined: ${dangling.join(', ')}`);

  assert.equal(pbx.match(/\{/g).length, pbx.match(/\}/g).length, 'unbalanced braces');
  assert.equal(pbx.match(/\(/g).length, pbx.match(/\)/g).length, 'unbalanced parens');
});
