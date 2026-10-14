// Гостевой токен не подтверждает вход и не открывает завершение профиля.
export function onboardingNavKey({ hasToken, session, hasRole, verificationLevel }) {
  if (!hasToken || !session) return 'guest';
  if (hasRole) return 'main';
  return Number(verificationLevel) >= 1 ? 'norole' : 'guest';
}
