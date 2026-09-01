// P0 2026-09-01 — RUNTIME-тесты guard прямого deeplink urtruck://deals/{id}.
//
// Это НЕ source-regex тесты: сюда импортируется НАСТОЯЩИЙ резолвер
// resolveDealLinkAccess и выполняется с мокнутым api ({getDeal, rooms}).
// Проверяется именно та логика решений, которая крутится на устройстве,
// включая AbortError-пути, из-за которых Fedya/Armando висели 30–45 с на
// deal-access-guard (см. первопричину в src/utils/dealLinkGuard.js).
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_deal_deeplink_guard_runtime.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEAL_ACCESS } from '../../src/utils/dealAccess.js';
import { resolveDealLinkAccess } from '../../src/utils/dealLinkGuard.js';
import { verifyDealMembership } from '../../src/utils/dealMembership.js';

const DEAL_ID = '88C842D6-B879-4266-A2C8-DA32818A137B';

const abortError = () => {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
};

// CASE 1 — легитимный участник (Armando/Fedya): лёгкий GET /deals/{id} → 200.
test('CASE 1: участник по dealId → ALLOWED одним лёгким запросом, без /market/my', async () => {
  const calls = [];
  const api = {
    getDeal: async (id) => { calls.push(['getDeal', id]); return { id, chat_room_id: 'room-77', status: 'in_progress' }; },
    rooms: async () => { calls.push(['rooms']); return { rooms: [] }; },
  };
  const r = await resolveDealLinkAccess({ dealId: DEAL_ID, api });
  assert.equal(r.state, DEAL_ACCESS.ALLOWED);
  assert.equal(r.dealId, DEAL_ID);
  assert.equal(r.roomId, 'room-77');
  assert.equal(r.source, 'direct-deal');
  assert.equal(typeof r.durationMs, 'number');
  assert.deepEqual(calls, [['getDeal', DEAL_ID]], 'ровно один лёгкий запрос; rooms/дашборд не трогаем');
});

// CASE 1b — физический дефект 2026-09-01: deeplink несёт UUID в ВЕРХНЕМ
// регистре, сервер (после регистро-устойчивого lookup) отдаёт КАНОНИЧЕСКИЙ
// строчный id. Строгое сравнение id уводило бы участника в UNAVAILABLE уже
// ПОСЛЕ успешной серверной проверки — оба сравнения регистро-независимы.
test('CASE 1b: UPPERCASE deeplink + канонический lowercase ответ → ALLOWED с каноническим id', async () => {
  const canonical = DEAL_ID.toLowerCase();
  const api = {
    getDeal: async () => ({ id: canonical, chat_room_id: 'room-77' }),
    rooms: async () => ({ rooms: [] }),
  };
  const r = await resolveDealLinkAccess({ dealId: DEAL_ID.toUpperCase(), api });
  assert.equal(r.state, DEAL_ACCESS.ALLOWED);
  assert.equal(r.dealId, canonical, 'дальше в workspace уходит канонический id сервера, не строка из URL');
});

// CASE 2 — проигравший торг (Berik): сервер 403 → конечный DENIED.
test('CASE 2: проигравший по deeplink → DENIED (403), не спиннер и не throw', async () => {
  const api = { getDeal: async () => ({ ok: false, status: 403, detail: 'forbidden' }), rooms: async () => ({ rooms: [] }) };
  const r = await resolveDealLinkAccess({ dealId: DEAL_ID, api });
  assert.equal(r.state, DEAL_ACCESS.DENIED);
  assert.equal(r.status, 403);
});

// CASE 3 — несуществующая сделка: 404 → DENIED.
test('CASE 3: неизвестный dealId → DENIED (404)', async () => {
  const api = { getDeal: async () => ({ ok: false, status: 404 }), rooms: async () => ({ rooms: [] }) };
  const r = await resolveDealLinkAccess({ dealId: 'no-such-deal', api });
  assert.equal(r.state, DEAL_ACCESS.DENIED);
  assert.equal(r.status, 404);
});

// CASE 4 — тот самый физический сценарий: запрос прерван 20-секундным
// AbortController из authedFetch («fetch error: Aborted» в logcat).
test('CASE 4: AbortError → конечный UNAVAILABLE (retryable), НЕ denied и НЕ allowed', async () => {
  const api = { getDeal: async () => { throw abortError(); }, rooms: async () => ({ rooms: [] }) };
  const r = await resolveDealLinkAccess({ dealId: DEAL_ID, api });
  assert.equal(r.state, DEAL_ACCESS.UNAVAILABLE, 'легитимного участника нельзя хоронить в DENIED из-за таймаута');
  assert.equal(r.error, 'AbortError');
});

// CASE 5 — 5xx сервера → UNAVAILABLE (retryable), fail closed.
test('CASE 5: 5xx → UNAVAILABLE, workspace не открывается', async () => {
  const api = { getDeal: async () => ({ ok: false, status: 502 }), rooms: async () => ({ rooms: [] }) };
  const r = await resolveDealLinkAccess({ dealId: DEAL_ID, api });
  assert.equal(r.state, DEAL_ACCESS.UNAVAILABLE);
});

// CASE 6 — «Повторить»: после транзиентного сбоя повторный прогон резолвера
// (то, что делает кнопка retry через attempt+1) даёт ALLOWED.
test('CASE 6: retry после abort → ALLOWED со второй попытки', async () => {
  let first = true;
  const api = {
    getDeal: async (id) => {
      if (first) { first = false; throw abortError(); }
      return { id, chat_room_id: 'room-77' };
    },
    rooms: async () => ({ rooms: [] }),
  };
  const attempt1 = await resolveDealLinkAccess({ dealId: DEAL_ID, api });
  assert.equal(attempt1.state, DEAL_ACCESS.UNAVAILABLE);
  const attempt2 = await resolveDealLinkAccess({ dealId: DEAL_ID, api });
  assert.equal(attempt2.state, DEAL_ACCESS.ALLOWED);
  assert.equal(attempt2.dealId, DEAL_ID);
});

// CASE 7 — roomId/partner-входы: членство только через комнаты ТЕКУЩЕГО юзера.
test('CASE 7: roomId/partner входы — свой room → ALLOWED, чужой/без сделки → DENIED, сеть → UNAVAILABLE', async () => {
  const roomsPayload = {
    rooms: [
      { id: 'room-1', deal_id: 'deal-a', partner_id: 'p-9', partner_name: 'Armando' },
      { id: 'room-2', deal_id: null, partner_id: 'p-5' },
    ],
  };
  const api = { getDeal: async () => { throw new Error('must not be called'); }, rooms: async () => roomsPayload };

  const own = await resolveDealLinkAccess({ roomId: 'room-1', api });
  assert.equal(own.state, DEAL_ACCESS.ALLOWED);
  assert.equal(own.dealId, 'deal-a');
  assert.equal(own.roomId, 'room-1');
  assert.equal(own.room?.partner_id, 'p-9');

  const foreign = await resolveDealLinkAccess({ roomId: 'room-404', api });
  assert.equal(foreign.state, DEAL_ACCESS.DENIED);

  const roomWithoutDeal = await resolveDealLinkAccess({ roomId: 'room-2', api });
  assert.equal(roomWithoutDeal.state, DEAL_ACCESS.DENIED, 'комната без сделки — pre-deal чат запрещён');

  const partnerWithDeal = await resolveDealLinkAccess({ partnerId: 'p-9', api });
  assert.equal(partnerWithDeal.state, DEAL_ACCESS.ALLOWED);
  assert.equal(partnerWithDeal.dealId, 'deal-a');

  const partnerWithoutDeal = await resolveDealLinkAccess({ partnerId: 'p-5', api });
  assert.equal(partnerWithoutDeal.state, DEAL_ACCESS.DENIED);

  const netFail = await resolveDealLinkAccess({
    roomId: 'room-1',
    api: { ...api, rooms: async () => { throw abortError(); } },
  });
  assert.equal(netFail.state, DEAL_ACCESS.UNAVAILABLE);
});

// Fail closed: 200, но тело — ДРУГАЯ сделка (аномалия прокси/транспорта).
test('200 с чужим id → UNAVAILABLE (никогда не ALLOWED)', async () => {
  const api = { getDeal: async () => ({ id: 'another-deal-entirely', chat_room_id: 'x' }), rooms: async () => ({ rooms: [] }) };
  const r = await resolveDealLinkAccess({ dealId: DEAL_ID, api });
  assert.equal(r.state, DEAL_ACCESS.UNAVAILABLE);
});

// verifyDealMembership (вход CargoDetailV2/TripDetailV2) — тот же лёгкий
// оракул: runtime-проверка через глобальный fetch-мок.
test('verifyDealMembership бьёт в GET /market/deals/{id} и корректно классифицирует ответы', async (t) => {
  const seen = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).includes('/deals/deal-mine')) {
      return { ok: true, status: 200, json: async () => ({ id: 'deal-mine', status: 'in_progress' }) };
    }
    if (String(url).includes('/deals/deal-foreign')) {
      return { ok: false, status: 403, json: async () => ({ detail: 'forbidden' }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };

  const mine = await verifyDealMembership('deal-mine');
  assert.deepEqual({ ok: mine.ok, allowed: mine.allowed, status: mine.status }, { ok: true, allowed: true, status: 200 });
  assert.equal(mine.deal?.id, 'deal-mine');

  const foreign = await verifyDealMembership('deal-foreign');
  assert.deepEqual({ ok: foreign.ok, allowed: foreign.allowed, status: foreign.status }, { ok: true, allowed: false, status: 403 });

  const broken = await verifyDealMembership('deal-5xx');
  assert.equal(broken.ok, false, '5xx — транзиент, не доказанный отказ');

  assert.ok(seen.every((u) => u.includes('/market/deals/')), `лёгкий endpoint, а не /market/my: ${seen}`);
  assert.ok(!seen.some((u) => u.endsWith('/market/my')), 'тяжёлый /market/my из membership-probe исключён');
});

// Unmount-safety + конечные состояния — те части, что живут в компоненте:
// держим их source-инвариантами рядом с runtime-кейсами.
test('ChatScreenV2: cancelled-гейт до каждого setState, конечные состояния, без myDashboard', () => {
  const chat = readFileSync('src/screens/ChatScreenV2.js', 'utf8');
  assert.match(chat, /let cancelled = false/);
  assert.match(chat, /if \(cancelled\) return;/);
  assert.match(chat, /return \(\) => \{ cancelled = true; \};/);
  assert.doesNotMatch(chat, /myDashboard/, 'тяжёлый дашборд исключён из deeplink-guard');
  assert.match(chat, /testID="deal-access-guard"/);
  assert.match(chat, /testID="deal-access-denied"/);
  assert.match(chat, /deal_access_denied_title/);
  assert.match(chat, /deal_access_go_deals/);
  assert.match(chat, /testID="deal-access-unavailable"/);
  assert.match(chat, /deal_access_check_failed/);
  assert.match(chat, /testID="deal-access-retry"/);
  assert.match(chat, /loading: authLoading/);
  assert.match(chat, /if \(authLoading\)/);
  assert.match(chat, /if \(!hasToken\)/);
  assert.match(chat, /\[deal-deeplink\]/);
  assert.doesNotMatch(chat, /Authorization|Bearer/, 'диагностика не должна касаться токенов');
});
