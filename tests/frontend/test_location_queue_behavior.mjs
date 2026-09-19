import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const queueSource = readFileSync('src/utils/locationQueue.js', 'utf8');
const { createLocationQueue, locationSampleId } = await import('data:text/javascript;base64,' + Buffer.from(queueSource).toString('base64'));
const sample = (n, dealId = 'deal') => ({ dealId, capturedAt: 1700000000000 + n * 25000, lat: 43, lng: 76 });
function memoryStore() {
  const data = new Map();
  return { data, get: async k => data.get(k) ?? null, set: async (k, v) => { data.set(k, v); }, remove: async k => { data.delete(k); }, keys: async () => [...data.keys()] };
}

test('очередь переживает новый runtime и хранит больше суток с интервалом 25 секунд', async () => {
  const store = memoryStore(), queue = createLocationQueue(store);
  for (let n = 0; n < 3500; n++) await queue.append(sample(n));
  const restored = await createLocationQueue(store).pending('deal');
  assert.equal(restored.length, 3500);
  assert.equal(restored[0].capturedAt, sample(0).capturedAt);
});

test('ошибка головы запрещает обгон, затем FIFO подтверждает все точки', async () => {
  let clock = 1700000000000;
  const queue = createLocationQueue(memoryStore(), { now: () => clock, random: () => 0.5 });
  await queue.append(sample(2)); await queue.append(sample(1));
  const posted = [];
  await queue.drain('deal', async s => { posted.push(s.capturedAt); return false; });
  assert.deepEqual(posted, [sample(1).capturedAt]);
  clock += 30000;
  await queue.drain('deal', async s => { posted.push(s.capturedAt); return true; });
  assert.deepEqual(posted, [sample(1).capturedAt, sample(1).capturedAt, sample(2).capturedAt]);
  assert.deepEqual(await queue.pending('deal'), []);
});

test('параллельные runtimes не перетирают записи и подтверждения соседней сделки', async () => {
  const store = memoryStore(), a = createLocationQueue(store), b = createLocationQueue(store);
  await Promise.all([a.append(sample(1)), b.append(sample(2)), b.append(sample(1, 'other'))]);
  await a.drain('deal', async () => true);
  assert.equal((await b.pending('other')).length, 1);
});

test('потерянный ответ повторяет стабильный идентификатор; ошибка хранения видна', async () => {
  let clock = 1700000000000;
  const options = { now: () => clock, random: () => 0.5 };
  const store = memoryStore(), queue = createLocationQueue(store, options);
  await queue.append(sample(1));
  let calls = [];
  await queue.drain('deal', async s => { calls.push(locationSampleId(s)); return false; });
  clock += 30000;
  await createLocationQueue(store, options).drain('deal', async s => { calls.push(locationSampleId(s)); return true; });
  assert.equal(calls[0], calls[1]);
  store.set = async () => { throw new Error('DISK_FULL'); };
  await assert.rejects(queue.append(sample(2)), /DISK_FULL/);
});

function backgroundHarness(reply, store = memoryStore(), postReply = null) {
  store.data.set('ur_reg_token', 'test-session');
  store.data.set('ur_session', '{"user":{"id":"driver"}}');
  store.data.set('ur_bg_deal_ids', '["deal"]');
  const posts = [];
  let task;
  let source = readFileSync('src/utils/backgroundLocation.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export \{.*\} from .*;\n/gm, '')
    .replace(/export /g, '');
  source += '\nglobalThis.api = {pushLocationToDeals, setActiveDealIds};';
  const sandbox = { Platform: { OS: 'android' }, storage: store, durableStorage: store,
    createLocationQueue, locationSampleId, API_BASE: 'https://test.invalid', t: k => k,
    AbortController, setTimeout, clearTimeout, console,
    require: name => name === 'expo-task-manager' ? { defineTask: (_, cb) => { task = cb; } } : {},
    fetch: async (url, options) => {
      if (url.endsWith('/active')) return reply(store);
      posts.push(JSON.parse(options.body));
      if (postReply) return postReply();
      return { ok: true, json: async () => ({ ok: true, sample_id: JSON.parse(options.body).sample_id }) };
    },
  };
  vm.runInNewContext(source, sandbox);
  return { ...sandbox.api, store, posts, task };
}

test('malformed HTTP 200 не стирает разрешённые IDs и очередь', async () => {
  for (const body of [{}, { ok: false, deal_ids: [] }, { ok: true, deal_ids: null }]) {
    const h = backgroundHarness(async () => ({ ok: true, json: async () => body }));
    await h.pushLocationToDeals({ lat: 43, lng: 76, timestamp: Date.now() });
    assert.equal(h.store.data.get('ur_bg_deal_ids'), '["deal"]');
    assert.equal(h.posts.length, 1);
  }
});

test('смена сессии во время запроса не сохраняет IDs и не отправляет координаты', async () => {
  const h = backgroundHarness(async store => {
    await store.set('ur_reg_token', 'another-session');
    return { ok: true, json: async () => ({ ok: true, deal_ids: ['wrong'] }) };
  });
  await h.pushLocationToDeals({ lat: 43, lng: 76, timestamp: Date.now() });
  assert.equal(h.posts.length, 0);
  assert.equal(h.store.data.get('ur_bg_deal_ids'), '["deal"]');
});

test('пустой callback не выдаёт кэш за свежий GPS; весь batch сохраняет время ОС', async () => {
  const h = backgroundHarness(async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: ['deal'] }) }));
  const timestamp = Date.now() - 60000;
  await h.task({ data: { locations: [{ coords: { latitude: 43, longitude: 76 }, timestamp }, { coords: { latitude: 44, longitude: 77 }, timestamp: timestamp + 1000 }] } });
  await h.task({ data: { locations: [] } });
  assert.deepEqual(h.posts.map(p => p.captured_at_ms), [timestamp, timestamp + 1000]);
});

test('успешный пустой active-ответ прекращает передачу, но оставляет недоставленные доказательства', async () => {
  const store = memoryStore();
  await createLocationQueue(store).append(sample(1));
  const h = backgroundHarness(async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: [] }) }), store);
  await h.pushLocationToDeals({ lat: 43, lng: 76, timestamp: Date.now() });
  assert.equal(h.posts.length, 0);
  assert.equal((await createLocationQueue(store).pending('deal')).length, 1);
  assert.equal((await createLocationQueue(store).pending('deal', 'driver')).length, 1);
});

test('очередь прошлого аккаунта не отправляется новым владельцем', async () => {
  const store = memoryStore(), queue = createLocationQueue(store);
  await queue.append({ ...sample(1), ownerId: 'old-user' });
  const h = backgroundHarness(async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: ['deal'] }) }), store);
  await h.pushLocationToDeals(null);
  assert.equal(h.posts.length, 0);
  assert.equal((await queue.pending('deal', 'old-user')).length, 1);
});

test('невалидная точка сохраняется в карантине и не блокирует следующие', async () => {
  const store = memoryStore(), queue = createLocationQueue(store);
  await queue.append(sample(1)); await queue.append(sample(2));
  const sent = [];
  await queue.drain('deal', async s => { sent.push(s.capturedAt); return s.capturedAt === sample(1).capturedAt ? { quarantine: 422 } : true; });
  assert.equal(sent.length, 2);
  assert.equal((await queue.pending('deal')).length, 0);
  const archive = [...store.data.values()].map(JSON.parse);
  assert.equal(archive[0].status, 422);
  assert.equal(archive[0].sample.capturedAt, sample(1).capturedAt);
});

test('реальный background adapter переносит Retry-After в durable очередь', async () => {
  const h = backgroundHarness(async () => ({ ok: true, json: async () => ({ ok: true, deal_ids: ['deal'] }) }), memoryStore(),
    () => ({ ok: false, status: 429, headers: { get: name => name === 'Retry-After' ? '120' : null } }));
  const before = Date.now();
  const point = { latitude: 43, longitude: 76, timestamp: before };
  await h.pushLocationToDeals(point);
  await h.pushLocationToDeals(point);
  assert.equal(h.posts.length, 1);
  const retry = JSON.parse([...h.store.data.entries()].find(([key]) => key.startsWith('ur_bg_retry_v1:'))[1]);
  assert.ok(retry.nextAttemptAt >= before + 120000);
  const pending = await createLocationQueue(h.store).pending('deal', 'driver');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].capturedAt, before);
});
