import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/screens/DealsScreen.js', import.meta.url), 'utf8');
const body = source.split(/const load = useCallback\(async \((?:\{ force = false \} = \{\})?\) => \{/)[1].split('}, []);')[0];
function harness() {
  let response = { my_deals: [{ id: 'known' }], incoming_bids: [], my_bids: [] };
  const state = {};
  const env = {
    loadRequestRef: { current: 0 },
    marketAPI: { myDashboard: async () => response }, notificationsAPI: { list: async () => ({ notifications: [] }) },
    unreadNotificationPaths: () => [],
    setLoadError: (v) => { state.error = v; }, setAllDeals: (v) => { state.deals = v; },
    setIncomingBids: (v) => { state.bids = v; }, setMyBids: (v) => { state.mine = v; },
    setUnreadNotifPaths() {}, setLoading() {}, console: { warn() {} },
  };
  return { state, response: (v) => { response = v; }, load: new Function(...Object.keys(env), `return async function({ force = false } = {}) { ${body} };`)(...Object.values(env)) };
}

test('failed refresh сохраняет последний успешный список и recovery заменяет его', async () => {
  const h = harness(); await h.load(); const previous = h.state.deals;
  for (const response of [{ my_deals: [], serverError: true }, { my_deals: [], authRequired: true }, {}, { my_deals: null }]) {
    h.response(response); await h.load();
    assert.equal(h.state.error, true); assert.equal(h.state.deals, previous);
  }
  h.response({ my_deals: [{ id: 'new' }] }); await h.load();
  assert.equal(h.state.error, false); assert.equal(h.state.deals[0].id, 'new');
});

test('client не кеширует ошибку как успешно загруженный пустой dashboard', async () => {
  const api = readFileSync(new URL('../../src/utils/marketAPI.js', import.meta.url), 'utf8');
  const method = api.split('  async myDashboard(')[1].split('  // ─── Drivers')[0];
  let calls = 0;
  const env = {
    headers: async () => ({ Authorization: 'test-only' }), BASE: '/market',
    authedFetch: async () => { calls++; return { status: calls === 1 ? 500 : 200, ok: calls > 1, json: async () => calls === 1 ? {} : { my_deals: [{ id: 'recovered' }] } }; },
    console: { warn() {} },
  };
  const state = api.slice(api.indexOf('const DASHBOARD_CACHE_MS'), api.indexOf('async function headers()'));
  const fetch = new Function(...Object.keys(env), `${state} return { async myDashboard(${method} }.myDashboard;`)(...Object.values(env));
  assert.equal((await fetch()).serverError, true);
  assert.equal((await fetch()).my_deals[0].id, 'recovered');
  assert.equal(calls, 2);
});

 test('HTTP 200 with malformed body is an error and cannot poison cache', async () => {
  const api = readFileSync(new URL('../../src/utils/marketAPI.js', import.meta.url), 'utf8');
  const method = api.split('  async myDashboard(')[1].split('  // ─── Drivers')[0];
  let calls = 0;
  const env = { headers: async () => ({ Authorization: 'test-only' }), BASE: '/market', console: { warn() {} },
    authedFetch: async () => ({ status: 200, ok: true, json: async () => ++calls === 1 ? {} : { my_deals: [] } }) };
  const state = api.slice(api.indexOf('const DASHBOARD_CACHE_MS'), api.indexOf('async function headers()'));
  const fetch = new Function(...Object.keys(env), `${state} return { async myDashboard(${method} }.myDashboard;`)(...Object.values(env));
  assert.equal((await fetch()).serverError, true); assert.deepEqual((await fetch()).my_deals, []); assert.equal(calls, 2);
});
