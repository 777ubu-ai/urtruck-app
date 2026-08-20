// Monotonic deal-status ordering for out-of-order network responses.
export const DEAL_STATUS_RANK = Object.freeze({
  accepted: 1,
  in_progress: 2,
  at_border: 3,
  delivered: 4,
  received: 5,
  completed: 6,
  cancelled: 99,
  rejected: 99,
  expired: 99,
});

export const DEAL_STATUS_META = Object.freeze({
  accepted: { labelKey: 'status_accepted', tone: 'info', icon: 'check-circle', order: 1 },
  in_progress: { labelKey: 'status_in_progress', tone: 'active', icon: 'truck', order: 2 },
  at_border: { labelKey: 'status_in_progress', tone: 'active', icon: 'map-pin', order: 3 },
  delivered: { labelKey: 'status_delivered', tone: 'waiting', icon: 'package', order: 4 },
  received: { labelKey: 'status_received', tone: 'success', icon: 'check-circle', order: 5 },
  completed: { labelKey: 'status_completed', tone: 'neutral', icon: 'check', order: 6 },
  cancelled: { labelKey: 'status_cancelled', tone: 'danger', icon: 'x-circle', order: 99 },
  rejected: { labelKey: 'status_rejected', tone: 'danger', icon: 'x-circle', order: 99 },
  expired: { labelKey: 'status_expired', tone: 'neutral', icon: 'clock', order: 99 },
});

const TERMINAL = new Set(['completed', 'cancelled', 'rejected', 'expired']);

export function canonicalDealStatus(status) {
  return status === 'awaiting_confirmation' ? 'delivered' : status;
}

export function pickDealStatus(current, incoming) {
  const cur = canonicalDealStatus(current);
  const next = canonicalDealStatus(incoming);
  if (!next) return cur;
  if (!cur) return next;
  if (cur === next) return cur;
  if (TERMINAL.has(cur)) return cur;

  // Server FSM requires the explicit receipt audit state. A stale/compressed
  // response must not visually skip delivered -> received. A full refresh can
  // still initialise directly from completed when there is no prior state.
  if (next === 'cancelled' && (cur === 'delivered' || cur === 'received')) return cur;
  if (next === 'cancelled') return 'cancelled';

  const curRank = DEAL_STATUS_RANK[cur];
  const nextRank = DEAL_STATUS_RANK[next];
  if (typeof curRank !== 'number' || typeof nextRank !== 'number') return cur;
  return nextRank > curRank ? next : cur;
}

export function userFacingDealStatus(status) {
  return canonicalDealStatus(status);
}
