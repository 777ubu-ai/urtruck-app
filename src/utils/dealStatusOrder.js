// Единый порядок стадий сделки — используется CargoDetail.js и TripDetail.js
// (ранее дублировался в обоих файлах, приказ владельца 05.08.2026 п.6),
// чтобы applyDeal() никогда не откатывал показанный статус назад, если
// устаревший сетевой ответ (гонка запросов, обошедшая seq-guard) приходит
// после более свежего.
//
// Актуальные значения deals.status на бэкенде (backend/api/marketplace.py,
// update_deal_status/_DEAL_FLOW): accepted → in_progress → at_border →
// delivered → completed, cancelled — из любого рабочего статуса.
// delivered ставит ВОДИТЕЛЬ (довёз), completed — ГРУЗООТПРАВИТЕЛЬ
// (подтвердил получение, терминальный статус). 'awaiting_confirmation'
// остаётся в карте как легаси-значение UI-фильтров (ChatsListScreen) —
// карта принимает его без падения, хотя бэкенд его не эмитит.
// P0-1 (08.08.2026): completed теперь эмитится бэкендом и имеет ранг ВЫШЕ
// delivered (иначе delivered↔completed с равным рангом застрял бы).
export const DEAL_STATUS_RANK = {
  accepted: 1,
  in_progress: 2,
  at_border: 3,
  awaiting_confirmation: 4,
  delivered: 5,
  completed: 6,
};

// Полностью терминальные статусы — сделка закрыта окончательно, ничем не
// переоткрывается. delivered сюда НЕ входит: из него допустим ровно один
// шаг вперёд — completed (подтверждение получения грузоотправителем).
// cancelled достижим из любого РАБОЧЕГО статуса (трактуется отдельно в
// pickDealStatus), но НЕ откатывает уже доставленный груз (05.08, п.6).
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Решает, какой статус показать: текущий (prev) или только что полученный
 * с сервера (next). Возвращает next, если переход допустим, иначе prev.
 *
 * Правила:
 *  - нет предыдущего значения (первая загрузка) — всегда берём next;
 *  - prev терминальный (completed/cancelled) — сделка закрыта, ничем не
 *    переоткрывается;
 *  - prev === 'delivered' — груз доставлен: допустим ровно один шаг вперёд,
 *    completed (подтверждение получения). Любой другой next (в т.ч.
 *    cancelled или откат в рабочий статус) отбрасывается — cancelled не
 *    отменяет задним числом уже доставленный груз (05.08, п.6);
 *  - next === 'cancelled', а prev — рабочий (не delivered/терминальный):
 *    допустимая отмена из любого рабочего статуса;
 *  - next — терминальный (completed), а prev — нет: шаг вперёд;
 *  - иначе сравниваем ранги: next применяется только если он не раньше prev
 *    по жизненному циклу сделки (устаревший ответ с более ранним статусом
 *    отбрасывается).
 */
export function pickDealStatus(prev, next) {
  if (!next) return prev;
  if (!prev) return next;
  if (prev === next) return next;
  if (TERMINAL_STATUSES.has(prev)) return prev;
  // delivered: единственный допустимый выход — completed. cancelled и любой
  // откат назад игнорируются (п.6: доставленный груз не отменяется).
  if (prev === 'delivered') return next === 'completed' ? 'completed' : prev;
  if (next === 'cancelled') return 'cancelled';
  if (TERMINAL_STATUSES.has(next)) return next;
  const prevRank = DEAL_STATUS_RANK[prev] ?? 0;
  const nextRank = DEAL_STATUS_RANK[next] ?? 0;
  return nextRank >= prevRank ? next : prev;
}

// userFacingDealStatus — ТОЛЬКО для текста статуса, который видит
// пользователь (05.08.2026, п.8 ТЗ): «На границе» временно убрана из
// словаря — обычному водителю/грузовладельцу этот шаг не несёт действия
// (граница проходится сама, следующая КНОПКА всё равно «Доставлен»), а
// лишняя стадия в и без того длинном списке статусов только запутывает.
// Реальный deal.status на бэкенде (_FLOW в marketplace.py) НЕ меняется —
// это чисто витринная свёртка: at_border показывается как «В работе»,
// кнопка следующего действия (mark_arrived → «Доставлен») остаётся верной
// для настоящего технического статуса, никакого рассинхрона между тем,
// что видно, и тем, что реально произойдёт по нажатию.
export function userFacingDealStatus(status) {
  return status === 'at_border' ? 'in_progress' : status;
}
