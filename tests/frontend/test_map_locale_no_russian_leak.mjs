// test_map_locale_no_russian_leak — regression guard for the P0 found during
// the App Store release audit (Issue #254, 2026-08-20).
//
// Both TruckMap implementations rendered map UI in hardcoded Russian with zero
// i18n plumbing, so a ZH/EN/KK user saw Russian regardless of the selected
// language:
//
//   TruckMap.native.js  (ships in the iOS bundle)
//     L132  title={index === 0 ? 'Старт' : ... 'Назначение' : 'Точка маршрута'}
//     L136  title={title || 'Машина'}
//     L28   `${rounded} км`
//     L38-40 `${days} д`, `${hours} ч`, `${minutes} мин`
//   TruckMap.web.js — same defect (Placemark hintContent + same formatters)
//
// Those strings feed the distance/duration cards in RouteMap, TrackTruckScreen,
// DealWorkspaceScreen and DealWorkspaceScreenV2, so the leak was visible on the
// primary deal-tracking surface. Issue #254 classifies "language leakage in
// system UI" as an automatic NO-GO.
//
// Fix: both files take the translator and use the pre-existing km_short /
// track_day / track_hour / track_min keys plus new map_point_* keys.
//
// Also guards src/utils/security.js, where COLOR_UI.label held '🟢 Надёжный'
// and SecurityBadge rendered it verbatim on driver profiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CYRILLIC = /[А-яЁё]/;
// crude JS string-literal matcher, good enough for these small files
const LITERAL = /(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/gs;

function cyrillicLiterals(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  src.split('\n').forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    const code = line.replace(/\/\/.*$/, '');
    for (const m of code.matchAll(LITERAL)) {
      if (CYRILLIC.test(m[2])) out.push(`${file}:${i + 1}  ${m[2].slice(0, 60)}`);
    }
  });
  return out;
}

for (const file of ['src/components/TruckMap.native.js', 'src/components/TruckMap.web.js']) {
  test(`${file} renders no hardcoded Cyrillic strings`, () => {
    const leaks = cyrillicLiterals(file);
    assert.deepEqual(leaks, [], `hardcoded Russian would leak into ZH/EN/KK UI:\n${leaks.join('\n')}`);
  });

  test(`${file} localizes map markers and distance/duration units`, () => {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /useI18n/, 'must consume the i18n hook');
    for (const key of ['map_point_start', 'map_point_destination', 'map_point_waypoint',
      'track_truck_marker', 'km_short', 'track_day', 'track_hour', 'track_min']) {
      assert.match(src, new RegExp(`t\\('${key}'\\)`), `must use t('${key}')`);
    }
    // the formatters must accept the translator rather than closing over Russian
    assert.match(src, /distanceTextFromMeters = \(value, t\)/);
    assert.match(src, /durationTextFromSeconds = \(value, t\)/);
  });
}

test('security COLOR_UI exposes i18n keys, not Russian labels', () => {
  const leaks = cyrillicLiterals('src/utils/security.js');
  assert.deepEqual(leaks, [], `hardcoded Russian in security.js:\n${leaks.join('\n')}`);
  const src = fs.readFileSync('src/utils/security.js', 'utf8');
  for (const key of ['badge_reliable', 'tier_newbie', 'security_badge_problems', 'blacklist']) {
    assert.match(src, new RegExp(`labelKey: '${key}'`), `COLOR_UI must map a color to ${key}`);
  }
  const badge = fs.readFileSync('src/components/SecurityBadge.js', 'utf8');
  assert.match(badge, /t\(ui\.labelKey\)/, 'SecurityBadge must translate the label key');
  assert.doesNotMatch(badge, /ui\.label\b/, 'SecurityBadge must not render a raw label string');
});

test('every new map/security key exists in all four languages', () => {
  const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');
  for (const key of ['map_point_start', 'map_point_destination', 'map_point_waypoint',
    'security_badge_problems']) {
    const count = [...i18n.matchAll(new RegExp(`^\\s+${key}:`, 'gm'))].length;
    assert.equal(count, 4, `${key} must be defined in RU/KK/ZH/EN (found ${count})`);
  }
});
