import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detail = readFileSync('src/screens/CargoDetail.js', 'utf8');
const myWork = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
function resolve({ cargo = {}, fullCargo = null, userId = 'local-user', verdict = null } = {}) {
  const start = detail.indexOf('  const c = (() => {');
  const end = detail.indexOf('  const cid =', start);
  assert.ok(start >= 0 && end > start);
  return new Function('cargo', 'fullCargo', 'myUserId', 'listingOwnership', 'cargoId', 'paramCargo', 'lang', 'normalizeCargo',
    detail.slice(start, end) + '\nreturn c;')(cargo, fullCargo, userId, verdict, cargo.id || fullCargo?.id, cargo, 'RU', raw => ({ ...raw }));
}
const cargo = { id: 'cargo-a', status: 'active', owner_id: 'backend-user' };

test('opening an own cargo from MyWork carries ownership before any API reply', () => {
  const call = myWork.match(/navigation\.navigate\('CargoDetail', (\{[^\n]+\})\);/);
  assert.ok(call);
  let params;
  new Function('navigation', 'item', 'from', 'to', 'desc', 'role', `navigation.navigate('CargoDetail', ${call[1]});`)(
    { navigate(name, value) { assert.equal(name, 'CargoDetail'); params = value; } }, cargo, 'A', 'B', 'cargo', 'client');
  assert.equal(params.cargo.isMine, true);
  assert.equal(resolve({ cargo: params.cargo }).isMine, true);
});
test('server owner verdict handles local/backend user ID mismatch', () => {
  assert.equal(resolve({ cargo, fullCargo: cargo, verdict: { cargoId: cargo.id, userId: 'local-user', isOwner: true } }).isMine, true);
});
test('server ownership works before the detail request finishes', () => {
  assert.equal(resolve({ cargo, verdict: { cargoId: cargo.id, userId: 'local-user', isOwner: true } }).isMine, true);
});
test('authoritative non-owner verdict overrides a stale navigation hint', () => {
  assert.equal(resolve({ cargo: { ...cargo, isMine: true }, fullCargo: cargo, verdict: { cargoId: cargo.id, userId: 'local-user', isOwner: false } }).isMine, false);
});
test('another cargo or previous account verdict cannot grant owner controls', () => {
  for (const verdict of [
    { cargoId: 'cargo-b', userId: 'local-user', isOwner: true },
    { cargoId: cargo.id, userId: 'previous-user', isOwner: true },
  ]) assert.equal(!!resolve({ cargo, fullCargo: cargo, verdict }).isMine, false);
});
test('matching authenticated ID still detects ownership without a bids response', () => {
  assert.equal(resolve({ cargo, fullCargo: cargo, userId: 'backend-user' }).isMine, true);
});
test('unknown ownership keeps a foreign listing non-owner', () => {
  assert.equal(!!resolve({ cargo, fullCargo: cargo }).isMine, false);
});

test('real refresh callback captures the updated account at the same cargo', () => {
  const start = detail.indexOf('  const refreshDeal = useCallback(() => {');
  const end = detail.indexOf('\n  useFocusEffect', start);
  assert.ok(start >= 0 && end > start);
  let cached;
  const seen = [];
  const useCallback = (fn, deps) => {
    if (!cached || deps.some((value, index) => value !== cached.deps[index])) cached = { fn, deps };
    return cached.fn;
  };
  const render = new Function('useCallback', 'cid', 'routeDealId', 'dealId', 'myUserId',
    'marketAPI', 'setFullCargo', 'setCargoNotFound', 'setListingUnavailable', 'cargo',
    'loadBids', 'dealFetchSeq', 'applyDeal', detail.slice(start, end) + '\nreturn refreshDeal;');
  const noop = () => {};
  const api = { getCargo: async () => cargo, myDashboard: async () => ({ my_deals: [] }) };
  for (const userId of ['local-user', 'backend-user']) {
    const callback = render(useCallback, cargo.id, null, null, userId, api,
      noop, noop, noop, cargo, () => seen.push(userId), { current: 0 }, noop);
    callback();
  }
  assert.deepEqual(seen, ['local-user', 'backend-user']);
});
