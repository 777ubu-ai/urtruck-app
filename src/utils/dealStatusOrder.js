// Единый порядок стадий сделки — используется CargoDetail.js и TripDetail.js
// (ранее дублировался в обоих файлах, приказ владельца 05.08.2026 п.6),
// чтобы applyDeal() никогда не откатывал показанный статус назад, если
// устаревший сетевой ответ (гонка запросов, обошедшая seq-guard) приходит
// после более свежего.
//
// Актуальные значения deals.status на бэкенде (backend/api/marketplace.py,
// update_deal_status/_FLOW): accepted → in_progress → at_border → delivered,
// cancelled — из любого рабочего статуса. 'awaiting_confirmation' и
// 'completed' бэкендом как deal.status пока не эмитятся (только в
// защитных SQL-проверках/cargos.status), но уже используются как
// легитимные значения в фильтрах UI (ChatsListScreen) — карта готова
// принять их без падения already now, до того как бэкенд начнёт их слать.
export const DEAL_STATUS_RANK = {
  accepted: 1,
  in_progress: 2,
  at_border: 3,
  awaiting_confirmation: 4,
  delivered: 5,
  completed: 5,
};

// Статусы, из которых сделка больше никуда не двигается. cancelled сюда
// тоже входит, но трактуется отдельно (см. pickDealStatus): в отличие от
// delivered/completed, cancelled достижим из любого РАБОЧЕГО статуса, а не
// только «сверху» по рангу.
const FINISHED_STATUSES = new Set(['delivered', 'completed', 'cancelled']);

/**
 * Решает, какой статус показать: текущий (prev) или только что полученный
 * с сервера (next). Возвращает next, если переход допустим, иначе prev.
 *
 * Правила:
 *  - нет предыдущего значения (первая загрузка) — всегда берём next;
 *  - prev уже финальный (delivered/completed/cancelled) — сделка закрыта,
 *    более никакой статус (включая cancelled) её не переоткрывает и не
 *    «отменяет задним числом» уже доставленный груз (05.08, п.6: cancelled
 *    не должен безусловно откатывать completed);
 *  - next — финальный, а prev — нет: это всегда допустимый шаг вперёд,
 *    включая cancelled из любого рабочего статуса;
 *  - иначе сравниваем ранги: next применяется только если он не раньше prev
 *    по жизненному циклу сделки (устаревший ответ с более ранним статусом
 *    отбрасывается).
 */
export function pickDealStatus(prev, next) {
  if (!next) return prev;
  if (!prev) return next;
  if (prev === next) return next;
  if (FINISHED_STATUSES.has(prev)) return prev;
  if (FINISHED_STATUSES.has(next)) return next;
  const prevRank = DEAL_STATUS_RANK[prev] ?? 0;
  const nextRank = DEAL_STATUS_RANK[next] ?? 0;
  return nextRank >= prevRank ? next : prev;
}

// Display status intentionally mirrors the backend FSM. International trips
// require the visible at_border step; hiding it previously left the driver
// with a delivery button that the server correctly rejected.
export function userFacingDealStatus(status) {
  return status;
}
