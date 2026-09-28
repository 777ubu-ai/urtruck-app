import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationQueue, locationRetryAfterMs, LOCATION_RETRY_PREFIX } from '../../src/utils/locationQueue.js';

function harness() {
  const data = new Map();
  let clock = 1700000000000;
  const store = { get: async k => data.get(k) ?? null, set: async (k, v) => data.set(k, v), remove: async k => data.delete(k), keys: async () => [...data.keys()] };
  const options = { now: () => clock, random: () => 0.5 };
  const sample = n => ({ ownerId: 'driver', dealId: 'deal', capturedAt: 1600000000000 + n, lat: 43, lng: 76 });
  return { data, store, options, sample, advance: ms => { clock += ms; }, queue: createLocationQueue(store, options) };
}
const drain = (queue, post) => queue.drain('deal', post, async () => true, 'driver');

test('backoff переживает restart и повторный append, затем сохраняет FIFO', async () => {
  const h = harness();
  await h.queue.append(h.sample(1)); await h.queue.append(h.sample(2));
  let calls = 0;
  await drain(h.queue, async () => { calls++; return false; });
  const restarted = createLocationQueue(h.store, h.options);
  await restarted.append(h.sample(1));
  await drain(restarted, async () => { calls++; return true; });
  assert.equal(calls, 1);
  h.advance(30000);
  const delivered = [];
  await drain(restarted, async sample => { delivered.push(sample.capturedAt); return true; });
  assert.deepEqual(delivered, [h.sample(1).capturedAt, h.sample(2).capturedAt]);
  assert.equal(h.data.size, 0);
});

test('429 Retry-After соблюдается при новых callback и сохраняет capture', async () => {
  const h = harness(); await h.queue.append(h.sample(1));
  await drain(h.queue, async () => ({ retryAfter: '120' }));
  h.advance(119999);
  let count = 0;
  await drain(h.queue, async () => { count++; return true; });
  assert.equal(count, 0);
  h.advance(1);
  await drain(h.queue, async sample => { assert.equal(sample.capturedAt, h.sample(1).capturedAt); count++; return true; });
  assert.equal(count, 1);
});

test('ошибки сети дают возрастающую паузу с пределом пять минут', async () => {
  const h = harness(); await h.queue.append(h.sample(1));
  for (const wait of [30000, 60000, 120000, 240000, 300000, 300000]) {
    await drain(h.queue, async () => { throw new Error('NETWORK'); });
    const state = JSON.parse([...h.data.entries()].find(([k]) => k.startsWith(LOCATION_RETRY_PREFIX))[1]);
    assert.equal(state.nextAttemptAt - h.options.now(), wait);
    h.advance(wait);
  }
  assert.equal((await h.queue.pending('deal', 'driver')).length, 1);
});

test('сбой одной сделки не блокирует другую и не обходит авторизацию', async () => {
  const h = harness(); await h.queue.append(h.sample(1));
  await h.queue.append({ ...h.sample(2), dealId: 'other' });
  await drain(h.queue, async () => false);
  let count = 0;
  await h.queue.drain('other', async () => { count++; return true; }, async () => false, 'driver');
  assert.equal(count, 0);
  await h.queue.drain('other', async () => { count++; return true; }, async () => true, 'driver');
  assert.equal(count, 1);
  assert.equal((await h.queue.pending('deal', 'driver')).length, 1);
});

test('Retry-After принимает HTTP дату, отбрасывает мусор и ограничивает аномалии', () => {
  const now = Date.parse('2026-09-17T00:00:00Z');
  assert.equal(locationRetryAfterMs('Thu, 17 Sep 2026 00:02:00 GMT', now), 120000);
  for (const value of ['', null, 'not a date', '-12']) assert.equal(locationRetryAfterMs(value, now), 0);
  assert.equal(locationRetryAfterMs('999999999', now), 86400000);
});
