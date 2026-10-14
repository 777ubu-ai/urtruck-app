import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/utils/marketAPI.js', 'utf8');
const method = api.split('  async myDashboard(')[1].split('  // ─── Drivers')[0];
const moduleState = api.slice(api.indexOf('const DASHBOARD_CACHE_MS'), api.indexOf('async function headers()'));
const tick = () => new Promise((resolve) => setImmediate(resolve));
function harness() {
  let identity = 'fixture-A';
  const calls = [];
  const env = {
    BASE: '/market', console: { warn() {} },
    headers: async () => identity ? { Authorization: identity } : {},
    authedFetch: () => new Promise((resolve) => { calls.push((id) => resolve({ ok: true, status: 200, json: async () => ({ my_deals: [{ id }] }) })); }),
  };
  const fetch = new Function(...Object.keys(env), `${moduleState} return { async myDashboard(${method} }.myDashboard;`)(...Object.values(env));
  return { fetch, calls, identity: (value) => { identity = value; } };
}

test('dashboard cache is isolated by authenticated identity', async () => {
  const h = harness();
  const a = h.fetch(); await tick(); h.calls[0]('A'); await a;
  h.identity('fixture-B');
  const b = h.fetch(); await tick();
  assert.equal(h.calls.length, 2, 'B must not receive cached A data');
  h.calls[1]('B'); assert.equal((await b).my_deals[0].id, 'B');
});

test('late response from previous account is rejected after logout or account switch', async () => {
  for (const identity of [null, 'fixture-B']) {
    const h = harness(); const pending = h.fetch(); await tick();
    h.identity(identity); h.calls[0]('private-A');
    const result = await pending;
    assert.equal(result.authRequired, true);
    assert.deepEqual(result.my_deals, []);
  }
});

test('older normal request cannot overwrite the cache from forced refresh', async () => {
  const h = harness(); const old = h.fetch(); await tick();
  const fresh = h.fetch({ force: true }); await tick();
  h.calls[1]('fresh'); await fresh;
  h.calls[0]('old'); await old;
  const cached = await h.fetch();
  assert.equal(cached.my_deals[0].id, 'fresh');
  assert.equal(h.calls.length, 2);
});

test('coalesced dashboard callers reject a previous account response', async () => {
  for (const identity of [null, 'fixture-B']) {
    const h = harness();
    const first = h.fetch(); await tick();
    const second = h.fetch(); await tick();
    assert.equal(h.calls.length, 1, 'same-account reads share one HTTP request');
    h.identity(identity);
    h.calls[0]('private-A');
    for (const result of await Promise.all([first, second])) {
      assert.equal(result.authRequired, true);
      assert.deepEqual(result.my_deals, []);
    }
  }
});

test('coalesced callers still share successful same-account dashboard data', async () => {
  const h = harness();
  const first = h.fetch(); await tick();
  const second = h.fetch(); await tick();
  assert.equal(h.calls.length, 1);
  h.calls[0]('A');
  for (const result of await Promise.all([first, second])) {
    assert.equal(result.my_deals[0].id, 'A');
  }
});

test('actual Deals load ignores old dashboard and notification responses', async () => {
  const source = readFileSync('src/screens/DealsScreen.js', 'utf8');
  const body = source.split(/const load = useCallback\(async \(\{ force = false \} = \{\}\) => \{/)[1].split('}, []);')[0];
  const responses = [], notifications = [];
  const state = {};
  const env = {
    loadRequestRef: { current: 0 },
    marketAPI: { myDashboard: () => new Promise((resolve) => responses.push(resolve)) },
    notificationsAPI: { list: () => new Promise((resolve) => notifications.push(resolve)) },
    unreadNotificationPaths: (value) => value,
    setLoadError: (value) => { state.error = value; }, setLoading() {},
    setAllDeals: (value) => { state.deals = value; }, setIncomingBids() {}, setMyBids() {},
    setUnreadNotifPaths: (value) => { state.notifications = value; }, console: { warn() {} },
  };
  const load = new Function(...Object.keys(env), `return async function({ force = false } = {}) { ${body} };`)(...Object.values(env));
  const old = load(); const fresh = load({ force: true });
  responses[1]({ my_deals: [{ id: 'fresh' }] }); await tick();
  notifications[0](['fresh']); await fresh;
  responses[0]({ my_deals: [{ id: 'old' }] }); await tick();
  for (const resolve of notifications.slice(1)) resolve(['old']);
  await old;
  assert.equal(state.deals[0].id, 'fresh');
  assert.deepEqual(state.notifications, ['fresh']);
});
