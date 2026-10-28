import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../src/utils/externalFreightFeed.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replaceAll('export const ', 'const ');
function harness({ storage, send } = {}) {
  const calls = [];
  const context = vm.createContext({
    process: { env: {} }, Constants: { expoConfig: { extra: { urtruckExternalFreightFeedEnabled: false } } }, URLSearchParams, API_BASE: 'https://qa.example/api/v1',
    storage: storage || { get: async () => 'private-test-token' },
    authedFetch: async (url, options) => {
      calls.push({ url, options });
      return send ? send(url, options) : { ok: true, json: async () => ({ id: 'one', saved: options.method === 'PUT' }) };
    },
  });
  vm.runInContext(source + '\nthis.api = externalFreightAPI;', context);
  return { api: context.api, calls };
}

test('bookmark uses explicit idempotent PUT/DELETE and encoded identity', async () => {
  const { api, calls } = harness();
  assert.equal((await api.bookmark('one', true)).saved, true);
  assert.equal((await api.bookmark('one', true)).saved, true);
  assert.equal((await api.bookmark('one', false)).saved, false);
  await api.bookmark('a/b', true);
  assert.deepEqual(calls.map(x => x.options.method), ['PUT', 'PUT', 'DELETE', 'PUT']);
  assert.ok(calls[3].url.endsWith('/a%2Fb/bookmark'));
});

test('account switch during async token read prevents mutation', async () => {
  let resolveToken;
  let current = true;
  const { api, calls } = harness({ storage: { get: () => new Promise(resolve => { resolveToken = resolve; }) } });
  const pending = api.bookmark('one', true, undefined, () => current);
  current = false;
  resolveToken('new-account-token');
  assert.equal((await pending).error, 'session_changed');
  assert.equal(calls.length, 0);
});

test('missing auth and rejected save never report success', async () => {
  const unauth = harness({ storage: { get: async () => null } });
  assert.equal((await unauth.api.bookmark('one', true)).ok, false);
  assert.equal(unauth.calls.length, 0);
  const rejected = harness({ send: async () => ({ ok: false, status: 503, json: async () => ({ detail: { error: 'unavailable' } }) }) });
  const result = await rejected.api.bookmark('one', true);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unavailable');
});

test('external entry is isolated from the shared header', () => {
  const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  const shared = read('src/components/ui/v1/RootHeader.js');
  assert.doesNotMatch(shared, /externalFreight|externalFeed|Лента/);
  const entry = read('src/components/externalFreight/ExternalFreightEntry.js');
  assert.match(entry, /!EXTERNAL_FREIGHT_ENABLED/);
  assert.match(entry, /return children/);
  assert.match(entry, /\{children\}/);
  for (const file of ['CargoFeedScreen.js', 'FeedScreen.js']) assert.match(read('src/screens/' + file), /<ExternalFreightEntry/);
  for (const file of ['DealsScreen.js', 'MyTripsScreen.js', 'QueueScreenLazyV2.js']) assert.doesNotMatch(read('src/screens/' + file), /ExternalFreightEntry/);
});


test('count uses isolated read endpoint and rejects a changed owner before request', async () => {
  const valid = harness({ send: async () => ({ ok: true, json: async () => ({ kind: 'cargo', count: 100001 }) }) });
  assert.equal((await valid.api.count()).count, 100001);
  const countURL = new URL(valid.calls[0].url);
  assert.equal(countURL.pathname, '/api/v1/external-freight/count');
  assert.equal(countURL.searchParams.get('include_carriers'), 'true', 'счётчик ленты машин включает постоянный каталог перевозчиков');
  assert.equal(valid.calls[0].options.method, 'GET');
  const changed = harness();
  assert.equal((await changed.api.count(undefined, () => false)).error, 'session_changed');
  assert.equal(changed.calls.length, 0);
});

test('unavailable count is an error, never a synthetic zero', async () => {
  const unavailable = harness({ send: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  const result = await unavailable.api.count();
  assert.equal(result.ok, false);
  assert.equal(result.count, undefined);
});
