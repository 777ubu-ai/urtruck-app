// P0 2026-09-01 — позитивный путь прямого deeplink urtruck://deals/{id}.
//
// История: вариант D (PR #340) проверял явный dealId ЧЕРЕЗ ТЯЖЁЛЫЙ
// GET /market/my (дашборд всего юзера) и только потом падал в getDeal —
// на cold-start это давало 20+20 c последовательных таймаутов и «Aborted»
// в logcat у ЛЕГИТИМНЫХ участников. Теперь явный dealId подтверждается
// ПЕРВЫМ же запросом через лёгкий участник-gated GET /market/deals/{id};
// решения конечные (allowed/denied/unavailable). Полные runtime-кейсы —
// tests/frontend/test_deal_deeplink_guard_runtime.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const guard = readFileSync('src/utils/dealLinkGuard.js', 'utf8');
const route = readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');

test('direct dealId использует лёгкий участник-gated getDeal, никакого /market/my в deeplink-пути', () => {
  assert.match(chat, /const requestedDealId = params\.dealId \|\| null/);
  assert.match(chat, /resolveDealLinkAccess\(\{/);
  assert.doesNotMatch(chat, /myDashboard/);
  assert.match(guard, /marketAPI\.getDeal\(id\)/);
  // комментарий-разбор первопричины цитирует logcat «[myDashboard] fetch
  // error» — запрещаем именно ВЫЗОВ myDashboard(, а не слово в комментарии
  assert.doesNotMatch(guard, /myDashboard\(/);
  assert.match(guard, /classifyDealAccess\(direct\)/);
});

test('решение конечное и fail-closed: allowed только при совпадении id, отказ 401/403/404 → denied, транзиент → unavailable', () => {
  assert.match(guard, /String\(direct\?\.id \|\| ''\) !== String\(dealId\)/);
  assert.match(guard, /DEAL_ACCESS\.UNAVAILABLE, source: 'direct-deal'/);
  assert.match(chat, /guard\.state === DEAL_ACCESS\.ALLOWED && guard\.dealId/);
  assert.match(chat, /verifiedDealAccess: true/);
});

test('canonical route accepts only internal server-verified access without extra probe', () => {
  assert.match(route, /const trustedInternalAccess = params\.verifiedDealAccess === true/);
  assert.match(route, /if \(trustedInternalAccess && requestedDealId\)/);
});
