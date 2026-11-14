import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/screens/ExternalFreightFeedScreen.js', 'utf8');
const helper = source.slice(source.indexOf('async function listWithTimeout('), source.indexOf('\nfunction formatNumber', source.indexOf('async function listWithTimeout(')));

test('зависший запрос страницы завершается ошибкой даже если транспорт игнорирует abort', async () => {
  let signal;
  const listWithTimeout = vm.runInNewContext(`(${helper})`, {
    AbortController, setTimeout, clearTimeout, Promise,
    externalFreightAPI: { list: (_query, s) => { signal = s; return new Promise(() => {}); } },
  });
  const result = await listWithTimeout({}, null, 10);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'network_error');
  assert.equal(signal.aborted, true);
});

test('кэш страницы разделяет владельцев, роли и фильтры и не возвращает закрытые записи', () => {
  const cacheSource = source.slice(source.indexOf('const firstPageCache ='), source.indexOf('export default function ExternalFreightFeedScreen'));
  const cache = vm.runInNewContext(`${cacheSource}\n({ firstPageCacheKey, readFirstPageCache, rememberFirstPage })`, { Map, JSON, Date });
  const filters = { sort: 'newest' };
  const a = cache.firstPageCacheKey('A:driver', filters, false);
  const b = cache.firstPageCacheKey('B:driver', filters, false);
  const role = cache.firstPageCacheKey('A:client', filters, false);
  const filter = cache.firstPageCacheKey('A:driver', { sort: 'newest', origin: 'Алматы' }, false);
  cache.rememberFirstPage(a, [{ id: 'live', status: 'active' }, { id: 'closed', status: 'closed' }]);
  assert.deepEqual(Array.from(cache.readFirstPageCache(a), item => item.id), ['live']);
  for (const key of [b, role, filter]) assert.equal(cache.readFirstPageCache(key), null);
});
