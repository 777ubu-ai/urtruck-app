import { ACTIVE_DEAL_STATUSES, isBidActionable } from './dealsUnread.js';

// Бизнес-действия отдельны от canonical unread badge: они не увеличивают
// серверный unread snapshot, но должны оставаться видимы в списке сделок.
export function isDealBusinessActionRequired(deal, role) {
  if (!deal || !ACTIVE_DEAL_STATUSES.has(deal.status)) return false;
  return Boolean(deal.tracking_action_required)
    || (role === 'client' && ['delivered', 'awaiting_confirmation'].includes(deal.status));
}

export function countOfferBusinessActions(offers) {
  return (offers || []).reduce((sum, bid) => sum + (isBidActionable(bid, { asOwner: !!bid?._incoming }) ? 1 : 0), 0);
}

export function countActiveDealBusinessActions(deals, role) {
  return (deals || []).reduce((sum, deal) => sum + (isDealBusinessActionRequired(deal, role) ? 1 : 0), 0);
}
