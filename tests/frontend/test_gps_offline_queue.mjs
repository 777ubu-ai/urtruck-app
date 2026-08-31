// Регрессия P1 (reconciliation 01.09.2026, §9) — GPS-точка активного рейса
// терялась безвозвратно при потере сети.
//
// Баг: useDealLocationBroadcast.js слал координаты «выстрелил и забыл» —
// `marketAPI.sendDealLocation(id, payload)` без ожидания результата и без
// повторной попытки. На границе (at_border) сеть регулярно пропадает на
// минуты — точка, отправленная в этот момент, терялась НАВСЕГДА: следующий
// тик слал уже новую позицию, старая исчезала без следа. Для международных
// рейсов пропуск в треке приходится ровно на переход границы — где GPS
// важнее всего.
//
// Фикс: durable локальная очередь (gpsOutbox.js, тот же паттерн, что чат-
// outbox.js) + push() кладёт неудачную точку в очередь вместо потери, и сам
// же разгружает очередь при каждом тике/возврате в active. Backend-модель
// (deal_locations — UPSERT по deal_id, не история) делает разгрузку
// естественно идемпотентной: повторная/устаревшая точка просто
// перезаписывается более новой — доп. дедуп не нужен, критичен только
// порядок FIFO.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_gps_offline_queue.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  enqueueGpsPoint, flushGpsOutbox, gpsOutboxCount, clearGpsOutbox,
} from '../../src/utils/gpsOutbox.js';

const ok = () => ({ ok: true });
const fail = (status) => ({ ok: false, status });
const networkFail = () => ({ ok: false });

// ── функциональные: семантика очереди ───────────────────────

test('очередь: неотправленная точка не теряется, доставляется при восстановлении сети', async () => {
  await clearGpsOutbox();
  await enqueueGpsPoint('deal_1', { lat: 43.1, lng: 76.9 });
  assert.equal(await gpsOutboxCount(), 1);
  const sent = await flushGpsOutbox(async () => ok());
  assert.equal(sent, 1);
  assert.equal(await gpsOutboxCount(), 0, 'после успешной доставки очередь пуста');
});

test('очередь: сетевая ошибка не выбрасывает точку — ждём следующего flush', async () => {
  await clearGpsOutbox();
  await enqueueGpsPoint('deal_1', { lat: 1, lng: 1 });
  await enqueueGpsPoint('deal_1', { lat: 2, lng: 2 });
  const sent = await flushGpsOutbox(async () => networkFail());
  assert.equal(sent, 0);
  assert.equal(await gpsOutboxCount(), 2, 'нет сети — обе точки остаются в очереди');
});

test('очередь: постоянная 409 (рейс уже не активен) выбрасывает точку, не запирая остальные', async () => {
  await clearGpsOutbox();
  await enqueueGpsPoint('deal_stale', { lat: 1, lng: 1 });
  await enqueueGpsPoint('deal_2', { lat: 2, lng: 2 });
  const tried = [];
  const sent = await flushGpsOutbox(async (dealId) => {
    tried.push(dealId);
    return dealId === 'deal_stale' ? fail(409) : ok();
  });
  assert.deepEqual(tried, ['deal_stale', 'deal_2'], 'обе точки должны быть испробованы за один прогон');
  assert.equal(sent, 1);
  assert.equal(await gpsOutboxCount(), 0, 'устаревшая точка выброшена, а не заперла вторую');
});

test('очередь: порядок доставки FIFO — старые точки уходят первыми', async () => {
  await clearGpsOutbox();
  await enqueueGpsPoint('deal_1', { lat: 1, lng: 1 });
  await new Promise((r) => setTimeout(r, 5));
  await enqueueGpsPoint('deal_1', { lat: 2, lng: 2 });
  const order = [];
  await flushGpsOutbox(async (dealId, payload) => { order.push(payload.lat); return ok(); });
  assert.deepEqual(order, [1, 2], 'старая точка должна уйти раньше новой');
});

test('очередь: вечная 500 выбрасывается после лимита попыток, не заперев очередь навсегда', async () => {
  await clearGpsOutbox();
  await enqueueGpsPoint('deal_1', { lat: 1, lng: 1 });
  for (let i = 0; i < 5; i++) {
    await flushGpsOutbox(async () => fail(500));
  }
  assert.equal(await gpsOutboxCount(), 0, 'после MAX_ATTEMPTS точка уходит, иначе очередь стоит вечно');
});

// ── статические: проводка в хуке не удалена ─────────────────

const hookSrc = readFileSync('src/hooks/useDealLocationBroadcast.js', 'utf8');
const authSrc = readFileSync('src/utils/AuthContext.js', 'utf8');

test('useDealLocationBroadcast: неудачная точка кладётся в очередь, а не молча теряется', () => {
  assert.match(hookSrc, /import \{ enqueueGpsPoint, flushGpsOutbox \} from '\.\.\/utils\/gpsOutbox'/);
  const idx = hookSrc.indexOf('const push = async ()');
  assert.ok(idx > 0);
  const block = hookSrc.slice(idx, idx + 900);
  assert.match(block, /if \(!result\?\.ok\) await enqueueGpsPoint\(id, payload\)/,
    'провал отправки обязан класть точку в durable-очередь, а не проглатываться');
  assert.match(block, /flushGpsOutbox\(/, 'каждый тик обязан пытаться разгрузить накопленную очередь');
});

test('AuthContext: logout чистит GPS-очередь того же устройства (не только chat-outbox)', () => {
  assert.match(authSrc, /import \{ clearGpsOutbox \} from '\.\/gpsOutbox'/);
  assert.match(authSrc, /clearGpsOutbox\(\)/);
});
