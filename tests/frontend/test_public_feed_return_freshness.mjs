import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const [file, key, method] of [['CargoFeedScreen.js', 'cargos', 'listCargos'], ['FeedScreen.js', 'trips', 'listTrips']]) {
  const source = readFileSync(`src/screens/${file}`, 'utf8');
  test(`${file}: возврат из карточки и foreground запрашивают свежие данные`, () => {
    const calls = [], listeners = new Map(), appListeners = [], cleanups = [];
    let focused = true;
    const navigation = { isFocused: () => focused, addListener(event, callback) {
      listeners.set(event, callback); return () => listeners.delete(event);
    } };
    const AppState = { currentState: 'active', addEventListener(event, callback) {
      assert.equal(event, 'change'); appListeners.push(callback); return { remove() { appListeners.splice(appListeners.indexOf(callback), 1); } };
    } };
    const start = source.indexOf('  useEffect(() => { load(); }');
    const end = source.indexOf('  const visibleItems = items;', start);
    new Function('useEffect', 'useFocusEffect', 'useCallback', 'load', 'loadSaved', 'navigation', 'AppState', 'requestAnimationFrame', 'cancelAnimationFrame', 'scrollOffsetRef', 'listRef', 'loadSeqRef', 'pageRef', source.slice(start, end))(
      fn => cleanups.push(fn()), fn => cleanups.push(fn()), fn => fn,
      options => calls.push(options), () => {}, navigation, AppState, fn => { fn(); return 1; }, () => {}, { current: 800 }, { current: { scrollToOffset() {} } }, { current: 0 }, { current: {} },
    );
    assert.equal(calls.length, 1, 'Начальная загрузка не дублируется');
    focused = false; listeners.get('blur')?.();
    focused = true; listeners.get('focus')?.();
    assert.equal(calls.length, 2, 'Возврат из карточки должен перечитать сервер');
    assert.equal(calls.at(-1).preservePosition, true);
    for (const state of ['background', 'active']) {
      AppState.currentState = state; appListeners.forEach(fn => fn(state));
    }
    assert.equal(calls.length, 3, 'Foreground должен перечитать сервер');
    focused = false;
    for (const state of ['background', 'active']) appListeners.forEach(fn => fn(state));
    assert.equal(calls.length, 3, 'Фоновая вкладка не запрашивает данные');
    cleanups.forEach(fn => fn?.());
    assert.equal(appListeners.length, 0);
  });

  function loader() {
    const state = { items: [], price: 1, total: 100 }, calls = [];
    const env = {
      useCallback: fn => fn, pageRef: { current: { busy: false, nextOffset: null } }, loadSeqRef: { current: 0 },
      listRef: { current: { scrollToOffset: x => { state.offset = x.offset; } } }, scrollOffsetRef: { current: 800 },
      setError: x => { state.error = x; }, setErrorAppend() {}, setLoadingMore() {}, setLoading() {}, setRefreshing() {},
      setItems: x => { state.items = typeof x === 'function' ? x(state.items) : x; },
      dirFrom: '', dirTo: '', dirFromCountry: '', dirToCountry: '', filterType: '', myUserId: 'owner',
      dateFrom: '', dateTo: '', minPrice: '', maxPrice: '', priceCurrency: 'USD', sortBy: 'newest', savedOnly: false,
      toIso: () => '', normalizeTrip: x => ({ ...x, from: 'A', to: 'B' }), normalizeCargo: x => ({ ...x, from: 'A', to: 'B' }), console: { warn() {} },
      marketAPI: { [method]: async args => {
        calls.push(args.offset);
        if (state.failSecond && args.offset === 50) return { serverError: true };
        return { [key]: Array.from({ length: Math.min(50, state.total - args.offset) }, (_, n) => ({ id: String(args.offset + n), owner_id: 'other', driver_id: 'other', price: state.price })), has_more: args.offset + 50 < state.total, next_offset: args.offset + 50 < state.total ? args.offset + 50 : null };
      } },
    };
    const start = source.indexOf('  const load = useCallback('), end = source.indexOf('\n  useEffect(() => { load(); }', start);
    const load = new Function(...Object.keys(env), source.slice(start, end) + '\nreturn load;')(...Object.values(env));
    return { state, calls, env, load };
  }
  test(`${file}: старый ответ до ухода не подменяет данные после возвращения`, async () => {
    const h = loader(), pending = [], listeners = new Map();
    h.env.marketAPI[method] = args => new Promise(resolve => pending.push({ args, resolve }));
    const begin = source.indexOf('  useEffect(() => {\n    const removeFocus');
    const end = source.indexOf('  useEffect(() => { loadSaved(); }', begin);
    new Function('useEffect', 'navigation', 'load', 'AppState', 'loadSeqRef', 'pageRef', source.slice(begin, end))(
      fn => fn(), { isFocused: () => true, addListener(event, fn) { listeners.set(event, fn); return () => {}; } }, h.load,
      { currentState: 'active', addEventListener() { return { remove() {} }; } }, h.env.loadSeqRef, h.env.pageRef,
    );
    const old = h.load({ preservePosition: true });
    listeners.get('blur')?.(); listeners.get('focus')?.();
    assert.equal(pending.length, 2, 'Возврат требует новый запрос даже при старом запросе в полёте');
    const reply = price => ({ [key]: [{ id: '1', driver_id: 'other', owner_id: 'other', price }], has_more: false, next_offset: null });
    pending[1].resolve(reply(2)); await new Promise(resolve => setImmediate(resolve));
    pending[0].resolve(reply(1)); await old;
    assert.equal(h.state.items[0].price, 2);
  });
  test(`${file}: обновляются все загруженные страницы без сброса прокрутки`, async () => {
    const h = loader(); await h.load(); await h.load({ append: true });
    assert.equal(h.state.items.length, 100);
    h.env.scrollOffsetRef.current = 800; h.state.offset = 800; h.state.price = 2;
    await h.load({ preservePosition: true });
    assert.deepEqual(h.calls, [0, 50, 0, 50]);
    assert.equal(h.state.items.length, 100);
    assert.ok(h.state.items.every(x => x.price === 2));
    assert.equal(h.state.offset, 800);
    assert.equal(h.env.scrollOffsetRef.current, 800);
  });
  test(`${file}: новые страницы не вызывают полную загрузку выросшей выдачи при возврате`, async () => {
    const h = loader(); await h.load(); await h.load({ append: true });
    h.state.total = 1000; h.state.price = 2;
    await h.load({ preservePosition: true });
    assert.deepEqual(h.calls, [0, 50, 0, 50]);
    assert.equal(h.state.items.length, 100);
    assert.equal(h.env.pageRef.current.nextOffset, 100);
  });
  test(`${file}: сбой повторной страницы не выдаёт частичное обновление за полный список`, async () => {
    const h = loader(); await h.load(); await h.load({ append: true });
    h.state.price = 2; h.state.failSecond = true;
    await h.load({ preservePosition: true });
    assert.equal(h.state.error, true);
    assert.equal(h.state.items.length, 100);
    assert.ok(h.state.items.every(x => x.price === 1));
  });
}
