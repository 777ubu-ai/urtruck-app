import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const feed = fs.readFileSync('src/components/ui/v1/FeedCard.js', 'utf8');
const places = fs.readFileSync('src/utils/places.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');

test('unified marketplace save action uses the approved heart icon and calm price colour', () => {
  assert.doesNotMatch(feed, /❤️|🤍/);
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
