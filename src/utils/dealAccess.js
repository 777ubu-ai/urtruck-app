export const DEAL_ACCESS = Object.freeze({
  ALLOWED: 'allowed',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
});

// Classify the authoritative GET /market/deals/{id} response before any
// accepted-deal workspace UI is mounted. A dealId from navigation/deeplink is
// only an identifier, never proof of membership.
export function classifyDealAccess(result) {
  if (!result) return DEAL_ACCESS.UNAVAILABLE;
  if (result.ok !== false) return DEAL_ACCESS.ALLOWED;

  const status = Number(result.status || 0);
  if (status === 401 || status === 403 || status === 404) {
    return DEAL_ACCESS.DENIED;
  }
  return DEAL_ACCESS.UNAVAILABLE;
}
