import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const share = readFileSync('src/utils/share.js', 'utf8');
const cargo = readFileSync('src/screens/CargoDetail.js', 'utf8');
const trip = readFileSync('src/screens/TripDetail.js', 'utf8');
const app = readFileSync('App.js', 'utf8');
const marketplace = readFileSync('backend/api/marketplace.py', 'utf8');
const finalizer = readFileSync('scripts/finalize-web-export.mjs', 'utf8');

test('cargo and trip shares use the canonical plural listing path', () => {
  assert.match(share, /publicListingPath/);
  assert.match(cargo, /publicListingPath\('cargo', c\.id\)/);
  assert.match(trip, /publicListingPath\('trip', trip\.id\)/);
  assert.doesNotMatch(cargo, /WEB_URL[^\n]*\/cargo\//);
  assert.doesNotMatch(trip, /WEB_URL[^\n]*\/trip\//);
});

test('legacy singular links are normalized at the app boundary', () => {
  assert.match(app, /cargo:\s*'cargos'/);
  assert.match(app, /trip:\s*'trips'/);
});

test('public listing links can open before authentication on native and web', () => {
  assert.doesNotMatch(app, /Platform\.OS !== 'ios' && Platform\.OS !== 'android'\) return;\n\s*let active = true;/);
  const authKinds = app.match(/const needsAuth = parsed && \[([^\]]+)\]/)?.[1] || '';
  assert.doesNotMatch(authKinds, /'cargos'|'trips'/);
});

test('web export contains cache-busted social preview metadata', () => {
  assert.match(finalizer, /property="og:title"/);
  assert.match(finalizer, /property="og:image"/);
  assert.match(finalizer, /twitter:card/);
  assert.match(finalizer, /urtruck-market-v2\.png/);
  assert.match(finalizer, /assets\/hero\.jpg/);
});

test('direct listing detail is fail-closed for non-public rows', () => {
  assert.match(marketplace, /_can_view_non_public_listing/);
  assert.match(marketplace, /status <> 'cancelled'/);
  assert.match(marketplace, /AND status = 'active'/);
});
