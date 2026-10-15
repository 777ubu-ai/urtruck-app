import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const start = screen.indexOf('  const load = useCallback(');
const end = screen.indexOf('\n  const { refreshing, onRefresh }', start);
const tick = () => new Promise(resolve => setImmediate(resolve));
const page = (ids, next = null, scope = 'fixture-A') => ({
  items: ids.map(id => ({ id, status: 'active' })), next_offset: next, archive_total: 70, scope,
});
function harness({ driver = false } = {}) {
  const state = { data: null };
  const calls = [];
  const env = {
    pageRef: { current: { busy: false, nextOffset: null, scope: null } },
    loadRequestRef: { current: 0 }, mounted: { current: true }, isDriver: driver,
    useCallback: fn => fn, withTimeout: promise => promise,
    require: () => ({ storage: { get: async () => 'fixture-A' } }),
    marketAPI: { myListings: args => new Promise(resolve => calls.push({ args, resolve })) },
    setData: value => { state.data = typeof value === 'function' ? value(state.data) : value; },
    setArchiveTotal: value => { state.archiveTotal = value; },
    setLoadError: value => { state.error = value; },
    setLoading() {}, setRefreshingList() {}, setLoadingMore() {}, console: { warn() {} },
  };
  const render = tab => new Function(...Object.keys(env), 'tab',
    screen.slice(start, end) + '\nreturn load;')(...Object.values(env), tab);
  return { state, env, calls, render };
}
test('5000 записей доступны порциями по 50, без повторов и запроса всего набора', async () => {
  for (const driver of [false, true]) {
    const h = harness({ driver }); const load = h.render('routes');
    for (let offset = 0; offset < 5000; offset += 50) {
      const pending = load({ append: offset > 0 });
      await tick();
      const call = h.calls.at(-1);
      assert.equal(call.args.limit, 50); assert.equal(call.args.offset, offset);
      call.resolve(page(Array.from({ length: 50 }, (_, i) => offset + i),
        offset + 50 < 5000 ? offset + 50 : null));
      await pending;
    }
    const items = h.state.data[driver ? 'my_trips' : 'my_cargos'];
    assert.equal(items.length, 5000); assert.equal(new Set(items.map(x => x.id)).size, 5000);
    await load({ append: true }); assert.equal(h.calls.length, 100);
  }
});
test('повторный тап не дублирует запрос; ошибка страницы сохраняет список и offset для повтора', async () => {
  const h = harness(); const load = h.render('searching');
  const first = load(); await tick(); h.calls[0].resolve(page(['first'], 50)); await first;
  const next = load({ append: true }); await tick();
  await load({ append: true }); assert.equal(h.calls.length, 2);
  h.calls[1].resolve({ serverError: true }); await next;
  assert.deepEqual(h.state.data.my_cargos.map(x => x.id), ['first']); assert.equal(h.state.error, true);
  const retry = load({ append: true }); await tick();
  assert.equal(h.calls[2].args.offset, 50);
  h.calls[2].resolve(page(['first', 'second'])); await retry;
  assert.deepEqual(h.state.data.my_cargos.map(x => x.id), ['first', 'second']);
});
test('refresh отменяет старую страницу, а неуспешный refresh повторяется с первой страницы', async () => {
  const h = harness(); const load = h.render('searching');
  const first = load(); await tick(); h.calls[0].resolve(page(['first'], 50)); await first;
  const old = load({ append: true }); await tick();
  const fresh = load({ showLoading: false }); await tick();
  h.calls[2].resolve(page(['fresh'], 50)); await fresh;
  h.calls[1].resolve(page(['stale'])); await old;
  assert.deepEqual(h.state.data.my_cargos.map(x => x.id), ['fresh']);
  const fail = load({ showLoading: false }); await tick(); h.calls[3].resolve({ serverError: true }); await fail;
  assert.equal(h.env.pageRef.current.nextOffset, null);
});
test('поздний ответ active не заменяет архив; ответ после unmount ничего не меняет', async () => {
  const h = harness(); const old = h.render('searching')(); await tick();
  const archive = h.render('archive')(); await tick();
  h.calls[1].resolve(page(['archive'])); await archive;
  h.calls[0].resolve(page(['old-active'])); await old;
  assert.equal(h.state.data.section, 'archive');
  assert.equal(h.state.data.my_cargos[0].id, 'archive');
  const pending = h.render('archive')(); await tick();
  h.env.mounted.current = false; h.calls[2].resolve(page(['unmounted'])); await pending;
  assert.equal(h.state.data.my_cargos[0].id, 'archive');
});
test('смена аккаунта при append очищает чужие записи', async () => {
  const h = harness(); const load = h.render('searching');
  const first = load(); await tick(); h.calls[0].resolve(page(['private-A'], 50)); await first;
  const next = load({ append: true }); await tick(); h.calls[1].resolve(page(['B'], null, 'fixture-B')); await next;
  assert.deepEqual(h.state.data.my_cargos, []); assert.equal(h.state.data.authRequired, true);
});

const api = readFileSync('src/utils/marketAPI.js', 'utf8');
const apiMethod = api.slice(api.indexOf('  async myListings('), api.indexOf('  // ─── My Dashboard'));
function apiHarness() {
  let identity = 'fixture-A'; let fallbackCalls = 0;
  const pending = [];
  const legacy = { my_cargos: [{ id: 'active', status: 'active' }, { id: 'archive', status: 'unpublished' }] };
  const env = {
    BASE: '/market', headers: async () => identity ? { Authorization: identity } : {},
    authedFetch: (url, options) => new Promise(resolve => pending.push({ url, options, resolve })),
    marketAPI: { myDashboard: async () => { fallbackCalls++; return legacy; } },
  };
  const load = new Function(...Object.keys(env), 'return {' + apiMethod + '}.myListings;')(...Object.values(env));
  return { load, pending, identity: value => { identity = value; }, fallbackCalls: () => fallbackCalls };
}
const respond = (call, status, data) => call.resolve({ status, ok: status === 200, json: async () => data });
test('API сохраняет offset и bearer, не допускает поздний ответ другого аккаунта', async () => {
  const h = apiHarness(); const pending = h.load({ kind: 'trip', offset: 50 }); await tick();
  assert.match(h.pending[0].url, /offset=50/); assert.equal(h.pending[0].options.headers.Authorization, 'fixture-A');
  h.identity('fixture-B'); respond(h.pending[0], 200, { items: [{ id: 'private-A' }], total: 1, archive_total: 0, next_offset: null });
  assert.equal((await pending).stale, true);
});
test('fallback только для 404; 500, malformed и отсутствие авторизации не становятся пустым успехом', async () => {
  const h = apiHarness();
  const old = h.load({ section: 'archive' }); await tick(); respond(h.pending[0], 404, {}); const result = await old;
  assert.equal(result.items[0].id, 'archive'); assert.equal(result.paginationUnavailable, true);
  for (const [status, data] of [[500, {}], [200, {}], [200, { items: [], total: 1, archive_total: 0, next_offset: 0 }]]) {
    const pending = h.load(); await tick(); respond(h.pending.at(-1), status, data);
    assert.equal((await pending).serverError, true);
  }
  assert.equal(h.fallbackCalls(), 1);
  h.identity(null); assert.equal((await h.load()).authRequired, true);
});
