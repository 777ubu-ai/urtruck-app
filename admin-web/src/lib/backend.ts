const DEFAULT_BACKEND = 'https://urtruck.kz';

export type ControlSummary = {
  presence: { available: boolean; online: number | null; by_role: Record<string, number>; by_platform: Record<string, number>; window_seconds: number };
  stats: Record<string, number | null>;
};

export type Snapshot = {
  generatedAt: string;
  backend: { ok: boolean; status: string };
  stats: Record<string, number | null>;
  presence: ControlSummary['presence'];
  limitations: string[];
};

function baseUrl() {
  return (process.env.URTRUCK_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, '');
}

function basicHeader(user = process.env.URTRUCK_ADMIN_USER || '', pass = process.env.URTRUCK_ADMIN_PASS || '') {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

async function backendFetch(path: string, auth = basicHeader()) {
  return fetch(`${baseUrl()}${path}`, {
    cache: 'no-store',
    headers: { Authorization: auth, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  });
}

export async function fetchControl<T>(path: string): Promise<T | null> {
  try {
    const r = await backendFetch(`/api/v1/admin/control${path}`);
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

export async function validateBackendAdmin(user: string, pass: string): Promise<boolean> {
  try {
    const r = await backendFetch('/api/v1/admin/control/ping', basicHeader(user, pass));
    if (!r.ok) return false;
    const data = await r.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function loadSnapshot(): Promise<Snapshot> {
  const summary = await fetchControl<ControlSummary>('/summary');
  const presence = summary?.presence || { available: false, online: null, by_role: {}, by_platform: {}, window_seconds: 90 };
  return {
    generatedAt: new Date().toISOString(),
    backend: { ok: !!summary, status: summary ? 'operational' : 'unavailable' },
    stats: { ...(summary?.stats || {}), onlineNow: presence.online },
    presence,
    limitations: [
      presence.available ? 'Presence подключён: online считается только по heartbeat за последние 90 секунд.' : 'Redis presence недоступен или backend ещё не обновлён — online не подменяется приблизительным значением.',
      'Текст чужих сообщений намеренно не отдаётся общим Control API; support-content требует отдельного audit-доступа.'
    ]
  };
}
