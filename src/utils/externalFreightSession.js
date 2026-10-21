// Лента использует роль текущей сессии, а не параметры старого маршрута.
export function sessionRole(session, routeRole = null) {
  const value = session?.user ? session.user.role : routeRole;
  const role = String(value || '').trim().toLowerCase();
  return role === 'shipper' ? 'client' : (['client', 'driver'].includes(role) ? role : null);
}
