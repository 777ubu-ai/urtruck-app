export function bidActionFailureMessage(result, fallbackKey, t) {
  if (result?.status === 401) return t('session_expired');
  if (result?.status === 409) return t('bid_not_pending');
  return (typeof result?.detail === 'string' && result.detail) || t(fallbackKey);
}
