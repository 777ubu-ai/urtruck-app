// Track: Claude harness fix (2026-09-08/09).
//
// Root cause (confirmed in the integration audit): physical QA showed
// clipped filter text — "Например, Алм…" / "Например, Мос…". Not truncated
// server data — routeValue()'s placeholder argument was
// t('create_field_from_placeholder')/t('create_field_to_placeholder')
// ('Например, Алматы' / 'Например, Москва'), text sized for
// CreateTripScreen.js's full-width input field, rendered instead inside
// FeedScreen.js/CargoFeedScreen.js's ~50%-width routeHalf column
// (flex: 1) with numberOfLines={1} — too long for the space, ellipsized.
//
// Fix: filter call sites pass t('signup_city_pick') instead — localized and
// short enough for the column,
// and isn't redundant with the "Откуда"/"Куда" (From/To) label already
// shown directly above it. create_field_from_placeholder/
// create_field_to_placeholder themselves are untouched — CreateTripScreen.js
// still uses the original long-form text for its real input field, and no
// backend data was touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test("FeedScreen and CargoFeedScreen's narrow route filter uses localized city selection copy, not the long form-field text", () => {
  for (const file of ['src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js']) {
    const src = readFileSync(file, 'utf8');
    // The bug: these two keys used inside the filter's numberOfLines={1}
    // routeValue Text elements specifically.
    assert.doesNotMatch(src, /routeValue\([^)]*create_field_(from|to)_placeholder/, `${file}: still passes the long form placeholder into the narrow filter`);
    assert.match(src, /t\('signup_city_pick'\)/, `${file}: must fall back to localized city selection copy`);
  }
});

test("CreateTripScreen's real full-width input keeps the original example-city placeholder — not touched by this fix", () => {
  const src = readFileSync('src/screens/CreateTripScreen.js', 'utf8');
  assert.match(src, /placeholder=\{t\('create_field_from_placeholder'\)\}/);
  assert.match(src, /placeholder=\{t\('create_field_to_placeholder'\)\}/);
});

test("the localized city selection label exists in all 4 supported languages", () => {
  const i18n = readFileSync('src/utils/i18n.js', 'utf8');
  const lines = i18n.split('\n');
  const blocks = { RU: [10, 2091], KK: [2091, 3917], ZH: [3917, 5725], EN: [5725, 7660] };
  for (const [lang, [start, end]] of Object.entries(blocks)) {
    const block = lines.slice(start, end).join('\n');
    assert.match(block, /signup_city_pick:\s*'/, `${lang}: signup_city_pick is missing`);
  }
});

test('the narrow filter columns still cap at one line (no layout blow-up from this change)', () => {
  for (const file of ['src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js']) {
    const src = readFileSync(file, 'utf8');
    // Find every numberOfLines={1} Text and confirm at least one of them
    // contains localized city copy before its closing </Text> (i.e. the fix
    // landed on an actually-capped line, not some unrelated spot).
    const capped = [...src.matchAll(/numberOfLines=\{1\}[\s\S]{0,200}?<\/Text>/g)];
    assert.ok(capped.length > 0, `${file}: no numberOfLines={1} Text blocks found at all`);
    assert.ok(capped.some((m) => m[0].includes("t('signup_city_pick')")), `${file}: city selection copy must be inside a one-line-capped Text, not floating free`);
  }
});
