import { isBidFresh } from './bidExpiry';

// dealsUnread — единая формула «требует внимания сейчас» для вкладки
// «Сделки» (05.08.2026, п.4/22 нового ТЗ).
//
// Раньше существовало ТРИ независимых счётчика непрочитанного:
//   - GET /chat/unread (глобально по всем chat_rooms, включая комнаты
//     отклонённых ставок — reject_bid тоже создаёт room, см. аудит п.4);
//   - GET /notifications/unread (отдельная таблица notifications, тоже без
//     фильтра по статусу сделки/ставки);
//   - per-deal unread_count в my_dashboard() (chat_messages по конкретной
//     сделке, тоже не смотрит на deal.status).
// Бейдж таба «Сделки» складывал первые два (notifUnread + chatUnread),
// а сумма по карточкам списка считалась из третьего — физически разные
// числа, которые не могли совпасть.
//
// Теперь ОДИН источник — тот же marketAPI.myDashboard(), который уже
// грузит DealsScreen. Правило: считаем только то, что реально ждёт
// действия пользователя ПРЯМО СЕЙЧАС и реально видно в текущей роли.
// Закрытые/просроченные ставки и завершённые/отменённые сделки не считаются.

// P1 (аудит 2026-08-21): delivered и received здесь ОТСУТСТВОВАЛИ. Это ровно
// те два состояния, где мяч на стороне грузоотправителя («Подтвердить
// получение», затем «Завершить сделку»), и где водитель обычно и пишет —
// бейдж «Сделки» обнулялся именно в момент передачи груза. Завершённые/
// отменённые (completed/cancelled/rejected/expired) по-прежнему НЕ считаем.
export const ACTIVE_DEAL_STATUSES = new Set([
  'accepted', 'in_progress', 'at_border', 'awaiting_confirmation', 'delivered', 'received',
]);

// Направление хода в торге не требует myUserId/counter_by: бизнес-правило
// BargainCard уже фиксирует его через сам статус —
//   'pending'   → мяч у ВЛАДЕЛЬЦА листинга (bidder только что предложил цену);
//   'countered' → мяч у БИДДЕРА (владелец только что ответил встречной ценой).
// incoming_bids/my_dashboard = ставки НА мои листинги → я владелец → 'pending' актуален.
// my_bids/my_dashboard = мои собственные ставки → я биддер → 'countered' актуален.
export function isBidActionable(bid, { asOwner }) {
  if (!bid) return false;
  return asOwner ? bid.status === 'pending' : bid.status === 'countered';
}

function isVisibleBidActionable(bid, { asOwner, role, now }) {
  if (!isBidActionable(bid, { asOwner })) return false;
  if (!isBidFresh(bid, now)) return false;

  // DealsScreen is role-specific. A client sees incoming bids for their cargo;
  // a driver sees their outgoing cargo bids plus incoming bids for their trips.
  // Without these guards a stale/cross-role bid can keep BottomNav at 1 while
  // DealsScreen correctly shows 0 — exactly the device repro from 2026-09-01.
  if (role === 'client') {
    return asOwner && !!bid.cargo_id;
  }
  if (role === 'driver') {
    return asOwner ? !!bid.trip_id : true;
  }

  // Backwards-compatible fallback for callers/tests that do not know the role.
  return true;
}

// dashboard — сырой ответ marketAPI.myDashboard() (my_deals/my_bids/incoming_bids).
// role MUST be passed by UI callers so badge math matches the visible Deals role.
export function computeDealsUnread(dashboard, { role = null, now = Date.now() } = {}) {
  if (!dashboard) return 0;
  let total = 0;

  for (const d of dashboard.my_deals || []) {
    if (!ACTIVE_DEAL_STATUSES.has(d.status)) continue;
    total += Number(d.unread_count) || 0;
    // System messages do not increment chat unread. A pending GPS request is
    // still an action the driver must see in the Deals badge.
    if (d.tracking_action_required) total += 1;
  }

  if (role !== 'client') {
    for (const b of dashboard.my_bids || []) {
      if (isVisibleBidActionable(b, { asOwner: false, role, now })) total += 1;
    }
  }

  for (const b of dashboard.incoming_bids || []) {
    if (isVisibleBidActionable(b, { asOwner: true, role, now })) total += 1;
  }

  return total;
}
