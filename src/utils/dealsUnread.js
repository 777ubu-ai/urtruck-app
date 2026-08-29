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
// грузит ChatsListScreen. Правило: считаем только то, что реально ждёт
// действия пользователя ПРЯМО СЕЙЧАС:
//   - непрочитанные сообщения в АКТИВНОЙ (не завершённой/отменённой) сделке;
//   - предложение/встречное предложение, мяч в котором на моей стороне.
// Закрытые ставки (rejected/cancelled/expired) и завершённые/отменённые
// сделки не считаются НИКОГДА, даже если в их комнате когда-то остались
// непрочитанные сообщения — иначе бейдж растёт бесконечно на мёртвых
// разговорах (ровно жалоба из п.4 ТЗ).

import { isBidFresh } from './bidExpiry.js';

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

// P1 (аудит 2026-08-29): единственное место, где считается вклад ОДНОЙ
// ставки в "требует внимания сейчас". Раньше DealsScreen.js держал
// собственную копию этой же проверки И ДОБАВЛЯЛ поверх isBidFresh() —
// BottomNav-бейдж (эта функция) не знал про TTL ставки (48ч, см.
// bidExpiry.js), поэтому просроченная-но-ещё-не-expired-на-бэке ставка
// считалась в бейдже таб-бара, но не в счётчике внутри самого экрана
// "Сделки" — цифры расходились. Теперь оба потребителя (BottomNav.js и
// DealsScreen.js) вызывают ИМЕННО эту функцию, а не переизобретают фильтр.
export function bidAttentionCount(bid, { asOwner }) {
  if (!isBidActionable(bid, { asOwner })) return 0;
  return isBidFresh(bid) ? 1 : 0;
}

// P1 (аудит 2026-08-29): единственное место, где считается вклад ОДНОЙ
// сделки в "требует внимания сейчас" (бакет "В работе"). `role` — роль
// ТЕКУЩЕГО пользователя (driver/client): статусы delivered/
// awaiting_confirmation требуют действия («Подтвердить получение») только
// от грузоотправителя (client) — у водителя на этом шаге действий больше
// нет. Раньше это условие жило только в DealsScreen.js и ОТСУТСТВОВАЛО в
// computeDealsUnread() — грузоотправитель видел "1" внутри экрана "Сделки"
// на карточке delivered-сделки без непрочитанных сообщений, но бейдж на
// таб-баре внизу молчал (0), хотя действие реально требовалось.
export function dealAttentionCount(deal, { role } = {}) {
  if (!deal || !ACTIVE_DEAL_STATUSES.has(deal.status)) return 0;
  let n = deal.unread_count || 0;
  // System messages do not increment chat unread. A pending GPS request is
  // still an action the driver must see in the Deals badge.
  if (deal.tracking_action_required) n += 1;
  if (role === 'client' && (deal.status === 'delivered' || deal.status === 'awaiting_confirmation')) n += 1;
  return n;
}

// dashboard — сырой ответ marketAPI.myDashboard() (my_deals/my_bids/incoming_bids).
// `role` — роль текущего пользователя, см. dealAttentionCount() выше.
export function computeDealsUnread(dashboard, { role } = {}) {
  if (!dashboard) return 0;
  let total = 0;
  for (const d of dashboard.my_deals || []) total += dealAttentionCount(d, { role });
  for (const b of dashboard.my_bids || []) total += bidAttentionCount(b, { asOwner: false });
  for (const b of dashboard.incoming_bids || []) total += bidAttentionCount(b, { asOwner: true });
  return total;
}
