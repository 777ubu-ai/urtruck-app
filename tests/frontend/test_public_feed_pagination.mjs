import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const [file, key, method] of [['FeedScreen.js', 'trips', 'listTrips'], ['CargoFeedScreen.js', 'cargos', 'listCargos']]) {
  const source = readFileSync('src/screens/' + file, 'utf8');
  const start = source.indexOf('  const load = useCallback(');
  const end = source.indexOf('\n  useEffect(() => { load(); }', start);
  function harness() {
    const calls = [], state = { items: [] };
    const env = {
      useCallback: fn => fn,
      pageRef: { current: { busy: false, nextOffset: null } }, loadSeqRef: { current: 0 },
      listRef: { current: { scrollToOffset: ({ offset }) => { state.scrolledTo = offset; } } }, scrollOffsetRef: { current: 1200 },
      setError: value => { state.error = value; }, setNextOffset: value => { state.next = value; },
      setItems: value => { state.items = typeof value === 'function' ? value(state.items) : value; },
      setLoadingMore() {}, setLoading() {}, setRefreshing() {},
      dirFrom: '', dirTo: '', dirFromCountry: 'KZ', dirToCountry: 'CN', filterType: '', myUserId: 'my-id',
      dateFrom: '20.10.2099', dateTo: '21.10.2099', minPrice: '10', maxPrice: '900', priceCurrency: 'KZT', sortBy: 'price-asc', savedOnly: true,
      toIso: value => value === '20.10.2099' ? '2099-10-20' : value === '21.10.2099' ? '2099-10-21' : '',
      console: { warn() {} },
      normalizeTrip: x => ({ ...x, from: 'Almaty', to: 'Astana' }),
      normalizeCargo: x => ({ ...x, from: 'Almaty', to: 'Astana' }),
      marketAPI: { [method]: args => new Promise(resolve => calls.push({ args, resolve })) },
    };
    const load = new Function(...Object.keys(env), source.slice(start, end) + '\nreturn load;')(...Object.values(env));
    return { state, calls, env, load };
  }
  const result = (offset, next, ids = Array.from({ length: 50 }, (_, i) => offset + i)) => ({
    [key]: ids.map(id => ({ id: String(id), driver_id: 'foreign', owner_id: 'foreign' })), next_offset: next,
  });
  test(file + ': все 5000 записей через 100 разных offset, с фиксированным лимитом', async () => {
    const h = harness();
    for (let offset = 0; offset < 5000; offset += 50) {
      const pending = h.load({ append: offset > 0 }); await tick();
      if (offset === 0) { assert.equal(h.env.scrollOffsetRef.current, 0); assert.equal(h.state.scrolledTo, 0); }
      const call = h.calls.at(-1);
      assert.equal(call.args.limit, 50); assert.equal(call.args.offset, offset);
      assert.equal(call.args.fromCountry, 'KZ'); assert.equal(call.args.toCountry, 'CN');
      assert.equal(call.args.dateFrom, '2099-10-20'); assert.equal(call.args.dateTo, '2099-10-21');
      assert.equal(call.args.minPrice, 10); assert.equal(call.args.maxPrice, 900);
      assert.equal(call.args.currency, 'KZT'); assert.equal(call.args.sortBy, 'price-asc'); assert.equal(call.args.savedOnly, true);
      call.resolve(result(offset, offset < 4950 ? offset + 50 : null)); await pending;
    }
    assert.equal(h.state.items.length, 5000);
    assert.equal(new Set(h.state.items.map(x => x.id)).size, 5000);
    await h.load({ append: true }); assert.equal(h.calls.length, 100);
  });
  test(file + ': пустая отфильтрованная страница не скрывает следующую, дубли/двойной тап безопасны', async () => {
    const h = harness(); const first = h.load(); await tick();
    h.calls[0].resolve(result(0, 50, [])); await first;
    assert.equal(h.state.next, 50);
    const second = h.load({ append: true }); await tick();
    await h.load({ append: true }); assert.equal(h.calls.length, 2);
    h.calls[1].resolve(result(50, 100, [1, 2])); await second;
    const third = h.load({ append: true }); await tick();
    h.calls[2].resolve(result(100, null, [2, 3])); await third;
    assert.deepEqual(h.state.items.map(x => x.id), ['1', '2', '3']);
  });
  test(file + ': ошибка страницы сохраняет список; refresh выигрывает у позднего append', async () => {
    const h = harness(); const first = h.load(); await tick();
    h.calls[0].resolve(result(0, 50, [1])); await first;
    const fail = h.load({ append: true }); await tick();
    h.calls[1].resolve({ serverError: true }); await fail;
    assert.equal(h.state.error, true); assert.deepEqual(h.state.items.map(x => x.id), ['1']);
    const old = h.load({ append: true }); await tick();
    const fresh = h.load(); await tick();
    h.calls[3].resolve(result(0, null, [5])); await fresh;
    h.calls[2].resolve(result(50, null, [2])); await old;
    assert.deepEqual(h.state.items.map(x => x.id), ['5']);
  });
}
const api = readFileSync('src/utils/marketAPI.js', 'utf8');
test('listTrips передаёт offset в настоящий запрос API', async () => {
  const method = api.slice(api.indexOf('  async listTrips('), api.indexOf('  async getTrip('));
  let url;
  const load = new Function('authedFetch', 'BASE', 'URLSearchParams', 'return {' + method + '}.listTrips;')(
    async value => { url = value; return { ok: true, json: async () => ({ trips: [], search_contract: 1 }) }; }, '/market', URLSearchParams);
  await load({ limit: 50, offset: 250, dateFrom: '2099-10-20', minPrice: 500, currency: 'USD', sortBy: 'price-asc', savedOnly: true });
  assert.match(url, /limit=50/); assert.match(url, /offset=250/);
  assert.match(url, /date_from=2099-10-20/); assert.match(url, /min_price=500/);
  assert.match(url, /currency=USD/); assert.match(url, /sort_by=price_asc/); assert.match(url, /saved_only=true/);
});

test('пустые ценовые границы не сериализуются как пустые числа', async () => {
  const method = api.slice(api.indexOf('  async listTrips('), api.indexOf('  async getTrip('));
  let url;
  const load = new Function('authedFetch', 'BASE', 'URLSearchParams', 'return {' + method + '}.listTrips;')(
    async value => { url = value; return { ok: true, json: async () => ({ trips: [], search_contract: 1 }) }; }, '/market', URLSearchParams);
  await load({});
  assert.doesNotMatch(url, /(?:\?|&)min_price=/);
  assert.doesNotMatch(url, /(?:\?|&)max_price=/);
});

test('advanced filters fail closed when connected to a backend without the search contract', async () => {
  const method = api.slice(api.indexOf('  async listCargos('), api.indexOf('  async getCargo('));
  const load = new Function('authedFetch', 'BASE', 'URLSearchParams', 'return {' + method + '}.listCargos;')(
    async () => ({ ok: true, json: async () => ({ cargos: [] }) }), '/market', URLSearchParams);
  const result = await load({ minPrice: 100, currency: 'USD' });
  assert.equal(result.unsupportedSearchContract, true);
  assert.equal(result.serverError, true);
});
