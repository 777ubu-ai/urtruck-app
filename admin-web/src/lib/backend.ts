const DEFAULT_BACKEND = 'https://urtruck.kz';

export type Snapshot = {
  generatedAt: string;
  backend: { ok: boolean; status: string; uptimeHours: number | null; errorRate: string | null };
  stats: {
    onlineNow: number | null;
    usersTotal: number | null;
    approvedDrivers: number | null;
    pendingModeration: number | null;
    reviewsTotal: number | null;
    blacklistActive: number | null;
    telegramMentions: number | null;
    requestsTotal: number | null;
    serverErrorsTotal: number | null;
  };
  limitations: string[];
};

function baseUrl() {
  return (process.env.URTRUCK_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, '');
}

function adminHeader() {
  const user = process.env.URTRUCK_ADMIN_USER || '';
  const pass = process.env.URTRUCK_ADMIN_PASS || '';
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

async function fetchText(path: string) {
  return fetch(`${baseUrl()}${path}`, {
    cache: 'no-store',
    headers: { Authorization: adminHeader(), Accept: 'text/plain, application/json' },
    signal: AbortSignal.timeout(8000)
  });
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetchText(path);
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

function metricNumber(text: string, name: string): number | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escaped}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)$`, 'm'));
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function sumMetric(text: string, name: string): number | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)$`, 'gm');
  let found = false;
  let total = 0;
  for (const match of text.matchAll(re)) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) { found = true; total += n; }
  }
  return found ? total : null;
}

export async function validateBackendAdmin(user: string, pass: string): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl()}/metrics`, {
      cache: 'no-store',
      headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` },
      signal: AbortSignal.timeout(8000)
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function loadSnapshot(): Promise<Snapshot> {
  const limitations = [
    'Realtime online/presence ещё не подключён: число online не подменяется приблизительными данными.',
    'Бизнес-счётчики грузов, ставок, сделок, чатов и GPS появятся после отдельного read-only /admin/control API.'
  ];

  let metrics = '';
  try {
    const r = await fetchText('/metrics');
    if (r.ok) metrics = await r.text();
  } catch {}

  const health = await fetchJson<{ status?: string; uptime_hours?: number; error_rate?: string }>('/health');
  const pending = await fetchJson<{ pending?: unknown[] }>('/admin/data/pending');
  const mentions = await fetchJson<{ mentions?: unknown[] }>('/admin/data/mentions');

  return {
    generatedAt: new Date().toISOString(),
    backend: {
      ok: health?.status === 'ok',
      status: health?.status || (metrics ? 'authenticated' : 'unavailable'),
      uptimeHours: typeof health?.uptime_hours === 'number' ? health.uptime_hours : null,
      errorRate: health?.error_rate || null
    },
    stats: {
      onlineNow: null,
      usersTotal: metricNumber(metrics, 'urtruck_drivers_total'),
      approvedDrivers: metricNumber(metrics, 'urtruck_drivers_approved'),
      pendingModeration: Array.isArray(pending?.pending) ? pending!.pending!.length : null,
      reviewsTotal: metricNumber(metrics, 'urtruck_reviews_total'),
      blacklistActive: metricNumber(metrics, 'urtruck_blacklist_active'),
      telegramMentions: Array.isArray(mentions?.mentions) ? mentions!.mentions!.length : null,
      requestsTotal: sumMetric(metrics, 'urtruck_requests_total'),
      serverErrorsTotal: sumMetric(metrics, 'urtruck_errors_total')
    },
    limitations
  };
}
