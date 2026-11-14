import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registration = fs.readFileSync('src/utils/registration.js', 'utf8');
function profileHarness(fetch) {
  const helper = registration.slice(registration.indexOf('async function fetchAccount('), registration.indexOf('\nfunction parsePendingLogoutTokens'));
  const method = registration.slice(registration.indexOf('  async profile('), registration.indexOf('\n  // Stage 50:'));
  const signals = [];
  const api = vm.runInNewContext(helper + '\n({' + method + '})', {
    BASE: 'https://test.invalid/register', API_BASE: 'https://test.invalid',
    AbortController, Promise,
    fetch: (url, options) => { signals.push(options.signal); return fetch(url, options); },
    setTimeout: (fn, ms) => setTimeout(fn, ms === 15000 ? 5 : ms), clearTimeout,
  });
  api.getToken = async () => 'synthetic';
  return { api, signals };
}
for (const stage of ['headers', 'body']) test('profile: bounded wait for hanging ' + stage, async () => {
  const h = profileHarness(() => stage === 'headers' ? new Promise(() => {})
    : Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) }));
  let guard;
  try {
    const result = await Promise.race([h.api.profile(), new Promise((_, reject) => {
      guard = setTimeout(() => reject(Error('PROFILE_HUNG')), 100);
    })]);
    assert.equal(result, null);
    assert.equal(h.signals[0].aborted, true);
  } finally { clearTimeout(guard); }
});
test('profile: success, server failure and malformed body remain optional', async () => {
  const success = profileHarness(async url => {
    assert.equal(url, 'https://test.invalid/users/me');
    return { ok: true, status: 200, json: async () => ({ name: 'Saved profile' }) };
  });
  assert.equal((await success.api.profile()).name, 'Saved profile');
  assert.equal(await profileHarness(async () => ({ ok: false, status: 503 })).api.profile(), null);
  assert.equal(await profileHarness(async () => ({ ok: true, status: 200, json: async () => { throw Error('bad JSON'); } })).api.profile(), null);
});

const screen = fs.readFileSync('src/screens/ExternalFreightFeedScreen.js', 'utf8');
const loadSource = screen.split('  const load = useCallback(')[1]
  .split('\n  }, [filters, cursor, savedOnly, ownerKey, rows, timeline, isDriver]);')[0] + '\n  }';
function feedHarness() {
  const requests = [], state = { rows: [], busy: false, error: null, cursor: null };
  const context = {
    AbortController, busyRef: { current: false }, requestRef: { current: null },
    sequenceRef: { current: 0 }, ownerRef: { current: 'A:driver' }, ownerKey: 'A:driver',
    filters: {}, cursor: null, savedOnly: false, rows: [], timeline: true, isDriver: true,
    session: { user: { id: 'A' } }, Platform: { OS: 'android' },
    paginationPendingRef: { current: false }, scrollToLatestRef: { current: false },
    anchorRef: { current: null }, followingRef: { current: true }, followUpdateRef: { current: false },
    setRowsOwner() {}, setUnseenIds() {},
    firstPageCacheKey: () => 'A:driver', rememberFirstPage() {},
    buildExternalFeedQuery: (_filters, { reset }) => ({ reset }),
    appendUnique: (current, incoming) => [...current, ...incoming],
    mergeLiveFeed: (_current, incoming) => incoming,
    setRows: value => { state.rows = typeof value === 'function' ? value(state.rows) : value; },
    setBusy: value => { state.busy = value; },
    setRefreshing() {}, setError: value => { state.error = value; },
    setErrorPage() {}, setCursor: value => { state.cursor = value; },
    listWithTimeout: (_query, signal) => new Promise(resolve => { requests.push({ signal, resolve }); }),
  };
  vm.createContext(context);
  return { context, state, requests, load: vm.runInContext('(' + loadSource + ')', context) };
}
test('cached filter reset starts a new request; old completion cannot unlock it', async () => {
  const h = feedHarness();
  const old = h.load({ reset: true });
  h.requests[0].signal.throwIfAborted();
  h.context.requestRef.current.abort(); // filter effect cleanup
  const latest = h.load({ reset: true, background: true });
  assert.equal(h.requests.length, 2, 'cached reset must replace aborted request');
  h.requests[0].resolve({ ok: false, error: 'network_error' });
  await old;
  assert.equal(h.context.busyRef.current, true, 'old request cannot unlock latest');
  h.requests[1].resolve({ ok: true, items: [{ id: 'latest' }], next_cursor: 'next' });
  await latest;
  assert.equal(h.context.busyRef.current, false);
  assert.equal(h.state.rows[0].id, 'latest');
  assert.equal(h.state.cursor, 'next');
  const next = h.load();
  assert.equal(h.requests.length, 3, 'pagination is no longer blocked');
  h.requests[2].resolve({ ok: true, items: [{ id: 'older' }] });
  await next;
});
test('aborted current request releases loading so retry can run', async () => {
  const h = feedHarness();
  const pending = h.load({ reset: true });
  h.context.requestRef.current.abort();
  h.requests[0].resolve({ ok: false, error: 'network_error' });
  await pending;
  assert.equal(h.context.busyRef.current, false);
  assert.equal(h.state.busy, false);
});
test('rapid cached resets ignore late success and keep latest rows', async () => {
  const h = feedHarness();
  const a = h.load({ reset: true });
  const b = h.load({ reset: true, background: true });
  const c = h.load({ reset: true, background: true });
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve({ ok: true, items: [{ id: 'C' }] });
  await c;
  h.requests[1].resolve({ ok: true, items: [{ id: 'B' }] });
  h.requests[0].resolve({ ok: true, items: [{ id: 'A' }] });
  await Promise.all([a, b]);
  assert.equal(h.state.rows[0].id, 'C');
  assert.equal(h.context.busyRef.current, false);
});
