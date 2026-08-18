import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const feed = fs.readFileSync('src/components/ui/v1/FeedCard.js', 'utf8');
const places = fs.readFileSync('src/utils/places.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');

// 2026-08-19: короткая инверсия туда-сюда на этой строке — задокументировано,
// чтобы никто не откатил обратно без явного нового решения владельца.
// urtruck-release-bot 9e4f83f (16.08.2026, "unify shipper cards") поменял
// исходное сердце (❤️/🤍) на Feather-флажок (bookmark) — это БЫЛО
// правильным направлением. В тот же день это ошибочно "исправили" обратно
// на сердце, решив, что несоответствие с FavoritesScreen (который один
// использовал сердце) нужно устранить в другую сторону. Владелец явно
// подтвердил (голосом, по прод-скриншоту): канон — ФЛАЖОК, не сердце.
// FavoritesScreen тоже переведён на bookmark отдельно. Тест закрепляет
// финальное, owner-подтверждённое состояние.
test('unified marketplace save action uses the approved bookmark icon and calm price colour', () => {
  assert.doesNotMatch(feed, /❤️|🤍/); // Feather-иконка, не emoji
  assert.match(feed, /name="bookmark"/);
  assert.match(feed, /fill=\{favActive \? SAVE : 'transparent'\}/);
  assert.match(feed, /accessibilityLabel=\{favActive \? t\('in_favorites'\) : t\('add_to_favorites'\)\}/);
  assert.doesNotMatch(feed, /name="heart"/);
  assert.doesNotMatch(feed, /color: '#E06D00'/);
});

test('route owns primary row and legacy flags are cleaned for RU too', () => {
  assert.match(feed, /numberOfLines=\{compact \? 1 : 2\}/);
  assert.match(places, /const clean = cleanPlaceName\(raw\);[\s\S]*return clean;/);
  assert.match(myTrips, /countryFlag\(item\.from_country\).*localizePlace\(from, lang\).*countryFlag\(item\.to_country\)/s);
});
