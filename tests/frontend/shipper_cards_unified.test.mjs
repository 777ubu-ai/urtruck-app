import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const feed = fs.readFileSync('src/components/ui/v1/FeedCard.js', 'utf8');
const places = fs.readFileSync('src/utils/places.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');

// 2026-08-19: было `name="bookmark"` — внесено авто-коммитом
// urtruck-release-bot 9e4f83f (16.08.2026, "unify shipper cards"), который
// заменил исходное сердце (❤️/🤍) на Feather-флажок. Это и есть первопричина
// прод-бага с владельческих скриншотов (2026-08-18): иконка сохранения на
// карточке ленты — флажок, а в «Избранном» (FavoritesScreen) — сердце,
// визуальная несогласованность. Тест ниже раньше закреплял именно баг;
// теперь закрепляет исправление (сердце везде, см. PR fix/favorites-cargo-and-icons-20260818).
test('unified marketplace save action uses the approved heart icon and calm price colour', () => {
  assert.doesNotMatch(feed, /❤️|🤍/); // Feather-иконка, не emoji
  assert.match(feed, /name="heart"/);
  assert.match(feed, /fill=\{favActive \? SAVE : 'transparent'\}/);
  assert.match(feed, /accessibilityLabel=\{favActive \? t\('in_favorites'\) : t\('add_to_favorites'\)\}/);
  assert.doesNotMatch(feed, /name="bookmark"/);
  assert.doesNotMatch(feed, /color: '#E06D00'/);
});

test('route owns primary row and legacy flags are cleaned for RU too', () => {
  assert.match(feed, /numberOfLines=\{compact \? 1 : 2\}/);
  assert.match(places, /const clean = cleanPlaceName\(raw\);[\s\S]*return clean;/);
  assert.match(myTrips, /countryFlag\(item\.from_country\).*localizePlace\(from, lang\).*countryFlag\(item\.to_country\)/s);
});
