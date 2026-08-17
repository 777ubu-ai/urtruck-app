// Monotonic deal-status ordering for out-of-order network responses.
export const DEAL_STATUS_RANK = Object.freeze({
  accepted: 1,
  in_progress: 2,
  at_border: 3,
  awaiting_confirmation: 4,
  delivered: 5,
  completed: 6,
  cancelled: 99,
});

const TERMINAL = new Set(['completed', 'cancelled']);

export function pickDealStatus(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;
  if (current === incoming) return current;
  if (TERMINAL.has(current)) return current;
  if (current === 'delivered') return incoming === 'completed' ? 'completed' : 'delivered';
  if (incoming === 'cancelled') return 'cancelled';
  if (incoming === 'completed') return current;
  const curRank = DEAL_STATUS_RANK[current];
  const nextRank = DEAL_STATUS_RANK[incoming];
  if (typeof curRank !== 'number' || typeof nextRank !== 'number') return current;
  return nextRank > curRank ? incoming : current;
}

export function userFacingDealStatus(status) {
  return status;
}
