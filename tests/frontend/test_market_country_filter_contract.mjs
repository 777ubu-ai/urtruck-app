import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const marketAPI = read('src/utils/marketAPI.js');
const feed = read('src/screens/FeedScreen.js');
const cargoFeed = read('src/screens/CargoFeedScreen.js');

assert.match(marketAPI, /from_country:\s*fromCountry/);
assert.match(marketAPI, /to_country:\s*toCountry/);
assert.match(feed, /fromCountry:\s*dirFromCountry/);
assert.match(feed, /toCountry:\s*dirToCountry/);
assert.match(cargoFeed, /fromCountry:\s*dirFromCountry/);
assert.match(cargoFeed, /toCountry:\s*dirToCountry/);
assert.match(cargoFeed, /allowCountryOnly/);
assert.match(cargoFeed, /setDirFromCountry/);
assert.match(cargoFeed, /setDirToCountry/);

console.log('market country filter contract: PASS');
