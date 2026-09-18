import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/CargoDetail.js', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');
const marketAPI = readFileSync('src/utils/marketAPI.js', 'utf8');

test('server non-public response closes stale cargo snapshot for bidding', () => {
  assert.match(source, /const \[listingUnavailable, setListingUnavailable\] = useState\(false\)/);
  assert.match(source, /setListingUnavailable\(true\)/);
  assert.match(source, /!listingUnavailable && c\.status === 'active'/);
  assert.match(source, /testID="cargo-listing-closed"/);
});

test('network failure alone does not mark a listing closed', () => {
  const refresh = source.slice(source.indexOf('marketAPI.getCargo(cid)'), source.indexOf('loadBids();', source.indexOf('marketAPI.getCargo(cid)')));
  const catchBlock = refresh.slice(refresh.indexOf('.catch'));
  assert.doesNotMatch(catchBlock, /setListingUnavailable\(true\)/);
});

test('listing detail requests carry auth for owner and participant access', () => {
  assert.match(marketAPI, /authedFetch\(`\$\{BASE\}\/cargos\/\$\{id\}`, \{ headers: await headers\(\) \}\)/);
  assert.match(marketAPI, /authedFetch\(`\$\{BASE\}\/trips\/\$\{id\}`, \{ headers: await headers\(\) \}\)/);
});

test('closed listing copy exists in all four locales', () => {
  assert.equal((i18n.match(/cargo_unavailable_for_bids:/g) || []).length, 4);
});
