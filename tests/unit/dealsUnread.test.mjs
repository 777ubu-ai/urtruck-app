// Unit-тесты единой формулы "требует внимания сейчас" для вкладки "Сделки"
// (аудит push/badge/sound, 2026-08-29).
//
// Регрессия: до этого фикса BottomNav.js (computeDealsUnread) и
// DealsScreen.js держали ДВЕ независимо продублированные версии одной и той
// же формулы, которые уже разошлись:
//   1. computeDealsUnread() не фильтровал ставки по isBidFresh() (48ч TTL) —
//      просроченная-но-ещё-не-expired-на-бэке ставка считалась в бейдже
//      таб-бара, но не в счётчике внутри самого экрана "Сделки".
//   2. computeDealsUnread() не знал про условие
//      "role === 'client' && status in (delivered, awaiting_confirmation)" —
//      грузоотправитель видел "1" на карточке delivered-сделки внутри
//      экрана "Сделки", но бейдж таб-бара внизу молчал (0).
//
// Тест фиксирует оба сценария как invariant, чтобы будущая правка одного
// потребителя без другого немедленно ломала CI.
//
//   node tests/unit/dealsUnread.test.mjs
import {
  computeDealsUnread,
  bidAttentionCount,
  dealAttentionCount,
  isBidActionable,
  ACTIVE_DEAL_STATUSES,
} from '../../src/utils/dealsUnread.js';

let failed = 0;
function check(desc, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? '  ok: ' : 'FAIL: ') + desc + ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failed++;
}

const FRESH = new Date().toISOString();
const STALE = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // 72h назад > 48h TTL

// ── REGRESSION 1: просроченная ставка не должна считаться нигде ──
const staleIncomingBid = { status: 'pending', updated_at: STALE, created_at: STALE };
check(
  'stale pending incoming bid: bidAttentionCount = 0 (isBidFresh gate)',
  bidAttentionCount(staleIncomingBid, { asOwner: true }),
  0,
);
check(
  'stale pending incoming bid still isBidActionable=true (raw predicate, no TTL)',
  isBidActionable(staleIncomingBid, { asOwner: true }),
  true,
);
check(
  'computeDealsUnread ignores stale bid in incoming_bids',
  computeDealsUnread({ my_deals: [], my_bids: [], incoming_bids: [staleIncomingBid] }, { role: 'client' }),
  0,
);

const freshIncomingBid = { status: 'pending', updated_at: FRESH, created_at: FRESH };
check(
  'fresh pending incoming bid: bidAttentionCount = 1',
  bidAttentionCount(freshIncomingBid, { asOwner: true }),
  1,
);
check(
  'computeDealsUnread counts fresh bid in incoming_bids',
  computeDealsUnread({ my_deals: [], my_bids: [], incoming_bids: [freshIncomingBid] }, { role: 'client' }),
  1,
);

// ── REGRESSION 2: delivered/awaiting_confirmation считается ТОЛЬКО у client ──
const deliveredDealNoUnread = { status: 'delivered', unread_count: 0, tracking_action_required: false };
check(
  'delivered deal, client role, no unread/tracking: dealAttentionCount = 1 (needs "Подтвердить получение")',
  dealAttentionCount(deliveredDealNoUnread, { role: 'client' }),
  1,
);
check(
  'delivered deal, driver role: dealAttentionCount = 0 (nothing left to do)',
  dealAttentionCount(deliveredDealNoUnread, { role: 'driver' }),
  0,
);
check(
  'computeDealsUnread (client): delivered deal alone counts as 1',
  computeDealsUnread({ my_deals: [deliveredDealNoUnread], my_bids: [], incoming_bids: [] }, { role: 'client' }),
  1,
);
check(
  'computeDealsUnread (driver): same delivered deal counts as 0',
  computeDealsUnread({ my_deals: [deliveredDealNoUnread], my_bids: [], incoming_bids: [] }, { role: 'driver' }),
  0,
);

const awaitingConfirmationDeal = { status: 'awaiting_confirmation', unread_count: 0, tracking_action_required: false };
check(
  'awaiting_confirmation deal, client role: dealAttentionCount = 1',
  dealAttentionCount(awaitingConfirmationDeal, { role: 'client' }),
  1,
);

// ── Базовые инварианты (не должны сломаться этим рефакторингом) ──
check(
  'terminal status (completed) never counts, any role',
  dealAttentionCount({ status: 'completed', unread_count: 5, tracking_action_required: true }, { role: 'client' }),
  0,
);
check(
  'unread_count adds up regardless of role',
  dealAttentionCount({ status: 'in_progress', unread_count: 3 }, { role: 'driver' }),
  3,
);
check(
  'tracking_action_required adds exactly +1',
  dealAttentionCount({ status: 'in_progress', unread_count: 0, tracking_action_required: true }, { role: 'driver' }),
  1,
);
check(
  'countered bid actionable only for the bidder (asOwner=false)',
  bidAttentionCount({ status: 'countered', updated_at: FRESH }, { asOwner: false }),
  1,
);
check(
  'countered bid NOT actionable for the owner (asOwner=true)',
  bidAttentionCount({ status: 'countered', updated_at: FRESH }, { asOwner: true }),
  0,
);
check(
  'ACTIVE_DEAL_STATUSES includes delivered/received (P1 2026-08-21 fix stays intact)',
  ACTIVE_DEAL_STATUSES.has('delivered') && ACTIVE_DEAL_STATUSES.has('received'),
  true,
);
check(
  'computeDealsUnread(null) is safe',
  computeDealsUnread(null, { role: 'client' }),
  0,
);

// ── Комбинированный сценарий: то, что видит BottomNav и DealsScreen, должно
// СОВПАДАТЬ, если считать одним и тем же вызовом (это и есть цель фикса —
// оба места вызывают буквально одну функцию, поэтому расхождение по
// построению невозможно, но зафиксируем ожидаемое число явно).
const dashboard = {
  my_deals: [
    { status: 'in_progress', unread_count: 2, tracking_action_required: false },
    { status: 'delivered', unread_count: 0, tracking_action_required: false },
    { status: 'completed', unread_count: 9, tracking_action_required: true }, // должен игнорироваться
  ],
  my_bids: [{ status: 'countered', updated_at: FRESH }],
  incoming_bids: [staleIncomingBid, { status: 'pending', updated_at: FRESH }],
};
check(
  'combined dashboard (client): 2 (unread) + 1 (delivered) + 1 (my_bids countered) + 1 (fresh incoming pending) = 5',
  computeDealsUnread(dashboard, { role: 'client' }),
  5,
);
check(
  'combined dashboard (driver): 2 (unread) + 0 (delivered, driver-side) + 1 (my_bids countered) + 1 (fresh incoming pending) = 4',
  computeDealsUnread(dashboard, { role: 'driver' }),
  4,
);

// ── Оригинальный тест этого файла (до рефакторинга 2026-08-29) — сохранён
// дословно, чтобы точно не потерять то, что он проверял: pending GPS-запрос
// (tracking_action_required) виден в бейдже "Сделки" даже без непрочитанных
// сообщений, а завершённая сделка полностью игнорируется. Вызов БЕЗ второго
// аргумента (role) — старый сигнатурный контракт остаётся рабочим.
check(
  'original test (pre-2026-08-29): tracking_action_required GPS request visible, completed ignored',
  computeDealsUnread({
    my_deals: [
      { status: 'accepted', unread_count: 0, tracking_action_required: 1 },
      { status: 'completed', unread_count: 9, tracking_action_required: 0 },
    ],
    my_bids: [],
    incoming_bids: [],
  }),
  1,
);

console.log(failed === 0 ? '\nAll dealsUnread tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
