// Роль маршрута служит только гостевому просмотру. Права берём из аккаунта.
export function sessionRole(session, routeRole = null) {
  const value = session?.user ? session.user.role : routeRole;
  const role = String(value || '').trim().toLowerCase();
  return role === 'shipper' ? 'client' : (['client', 'driver'].includes(role) ? role : null);
}

export async function confirmPublicationSession({ expectedRole, expectedUserId, getSession, readToken, readAccount }) {
  const currentOwner = () => getSession()?.user?.id === expectedUserId
    && sessionRole(getSession()) === expectedRole;
  const fail = code => { const e = new Error(code); e.code = code; throw e; };
  if (!expectedUserId || !currentOwner()) fail('PUBLICATION_SESSION_CHANGED');
  const token = await readToken();
  if (!token || !currentOwner()) fail('PUBLICATION_SESSION_CHANGED');
  const account = await readAccount(token);
  if (!currentOwner() || await readToken() !== token || !currentOwner()) fail('PUBLICATION_SESSION_CHANGED');
  if (!account || account.id !== expectedUserId) fail('PUBLICATION_SESSION_CHANGED');
  if (sessionRole({ user: account }) !== expectedRole) fail('PUBLICATION_ROLE_NOT_ALLOWED');
  return { expectedToken: token, isCurrent: currentOwner };
}
