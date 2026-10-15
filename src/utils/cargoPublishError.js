/** Return safe, localized UI copy for a cargo-publication failure. */
export function cargoPublishErrorMessage(result, t) {
  if (result?.errorCode === 'ROLE_NOT_ALLOWED') {
    return t('cargo_role_not_allowed');
  }
  return result?.detail || t('send_error');
}
