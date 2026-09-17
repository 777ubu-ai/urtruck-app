import assert from 'node:assert/strict';
import test from 'node:test';
import { routingAPI } from '../../src/utils/routingAPI.js';

test('маршрут не пропускает повреждённую промежуточную точку', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
  const result = await routingAPI.roadRoute([[29,120], [null,75], [55,37]]);
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});
test('маршрут завершает HTTP 502 и допускает успешный повтор', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({ detail: 'road_route_unavailable' }) });
  assert.equal((await routingAPI.roadRoute([[29,120],[55,37]])).status, 502);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, geometry: [[29,120],[55,37]] }) });
  assert.equal((await routingAPI.roadRoute([[29,120],[55,37]])).ok, true);
});
test('зависший запрос отменяется по таймауту', async () => {
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const result = await routingAPI.roadRoute([[29,120],[55,37]], null, { timeoutMs: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.detail, 'routing_cancelled_or_timeout');
});
test('выход с карты отменяет текущий запрос', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    controller.abort();
  });
  assert.equal((await routingAPI.roadRoute([[29,120],[55,37]], null, { signal: controller.signal })).ok, false);
});
