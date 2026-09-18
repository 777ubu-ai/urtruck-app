import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

register('./mocks/render-env-hooks.mjs', import.meta.url);

const { COUNTRY_FLAG_CODES, countryFlagXml } = await import('../../src/components/ui/v1/CountryFlag.js');
const countries = fs.readFileSync('src/utils/countries.js', 'utf8');
const routePicker = fs.readFileSync('src/components/RoutePointPicker.js', 'utf8');
const countryPicker = fs.readFileSync('src/screens/onboarding/CountryPickerSheet.js', 'utf8');
const cityInput = fs.readFileSync('src/components/CityInput.js', 'utf8');
const language = fs.readFileSync('src/components/LanguageSwitcher.js', 'utf8');
const cargoFeed = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');
const tripFeed = fs.readFileSync('src/screens/FeedScreen.js', 'utf8');

test('CountryFlag covers every ISO code offered by the active country data', () => {
  const offered = [...countries.matchAll(/iso:\s*'([A-Z]{2})'/g)].map((match) => match[1]);
  assert.ok(offered.length >= 40, 'country picker data is intentionally broad');
  assert.deepEqual([...new Set(offered)].sort(), [...COUNTRY_FLAG_CODES].sort());
  for (const code of offered) assert.ok(countryFlagXml(code), `${code} resolves to bundled SVG`);
});

test('country and city selectors render CountryFlag instead of their legacy emoji fields', () => {
  for (const [name, source] of Object.entries({ routePicker, countryPicker, cityInput, language })) {
    assert.match(source, /CountryFlag/, `${name} uses the shared renderer`);
  }
  assert.doesNotMatch(routePicker, /\{country\.flag\}|\{c\.flag\}|country\.flag \|\|/);
});

test('unified list feeds have compact filter controls, bookmarks and no cargo type label', () => {
  assert.match(cargoFeed, /CompactFilterChip/);
  assert.match(cargoFeed, /filterPill\('date',[\s\S]*'calendar'/);
  assert.match(cargoFeed, /filterPill\('body',[\s\S]*'truck'/);
  assert.match(cargoFeed, /filterPill\('capacity',[\s\S]*'truck'/);
  assert.match(cargoFeed, /icon="bookmark"/);
  assert.doesNotMatch(cargoFeed, /badge:\s*\{/);
  assert.doesNotMatch(cargoFeed, /heart/);
  assert.match(tripFeed, /CompactFilterChip/);
  assert.doesNotMatch(tripFeed, /heart/);
});
