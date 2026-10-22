// Только подтверждённый ответ сервера определяет, нужна ли регистрация.
export async function resolveLoginAccount(result, loadAccount) {
  const expectedId = result?.user_id || result?.driver_id;
  if (expectedId && (result?.role === 'driver' || result?.role === 'client')) {
    return { id: expectedId, role: result.role };
  }

  // Старые backend не включают роль в ответ проверки кода.
  const account = await loadAccount();
  if (!account?.id || typeof account.verification_level !== 'number'
    || (expectedId && account.id !== expectedId)) {
    throw new Error('LOGIN_ACCOUNT_UNAVAILABLE');
  }
  if (account.role === 'driver' || account.role === 'client') return { id: account.id, role: account.role };
  if (account.role === 'guest' || account.role === null || account.role === '') return { id: account.id, role: null };
  // Ошибка/неполный JSON не означают, что пользователь новый.
  throw new Error('LOGIN_ACCOUNT_UNAVAILABLE');
}

export async function resolveLoginRole(result, loadAccount) {
  return (await resolveLoginAccount(result, loadAccount)).role;
}

export async function loginIsCurrent(token, readToken, isMounted) {
  return Boolean(token) && isMounted() && await readToken() === token && isMounted();
}
