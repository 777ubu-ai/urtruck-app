const FIELDS = ['company_name', 'country', 'city', 'messenger_type', 'messenger_id'];

export function optionalProfileFields(profile = {}) {
  return Object.fromEntries(FIELDS.map(key => [key, String(profile[key] ?? '')]));
}

export function changedOptionalProfileFields(initial, current, dirty = Object.keys(current)) {
  const changes = {};
  for (const key of FIELDS) {
    if (!dirty.includes(key)) continue;
    const value = String(current[key] ?? '').trim();
    if (value !== String(initial[key] ?? '').trim()) changes[key] = value;
  }
  return changes;
}

// Отказ сессии не должен выглядеть как отсутствие сети или очищать форму.
export async function loadRegistrationProfile({ base, token, getToken, fetcher, signal }) {
  if (!token) return { error: 'session_expired' };
  try {
    const response = await fetcher(`${base}/users/me`, {
      headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store',
    });
    if (await getToken() !== token) return { error: 'session_expired' };
    if (!response.ok) return { error: response.status === 401 ? 'session_expired' : response.status >= 500 ? 'server_unavailable' : 'profile_v2_save_failed' };
    const profile = await response.json();
    if (await getToken() !== token) return { error: 'session_expired' };
    return { profile };
  } catch {
    return { error: 'no_connection' };
  }
}
