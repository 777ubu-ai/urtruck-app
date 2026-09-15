import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function auditPath() {
  return join(process.cwd(), '.admin-data', 'audit.jsonl');
}

function safe(value: unknown, max = 160): string {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, max);
}

export function requestIp(request: Request): string {
  const raw = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
  return safe(raw.split(',')[0].trim() || 'unknown', 64);
}

export function audit(event: {
  actor?: string; role?: string; action: string; target?: string;
  success?: boolean; ip?: string; detail?: string;
}) {
  const path = auditPath();
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    appendFileSync(path, JSON.stringify({
      at: new Date().toISOString(), actor: safe(event.actor || 'anonymous', 80),
      role: safe(event.role || '', 32), action: safe(event.action, 96),
      target: safe(event.target || '', 160), success: event.success !== false,
      ip: safe(event.ip || 'unknown', 64), detail: safe(event.detail || '', 240)
    }) + '\n', { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(path, 0o600); } catch {}
  } catch (error) {
    console.error('[admin-audit] write failed', error instanceof Error ? error.message : 'unknown');
  }
}

export function readAudit(limit = 200) {
  const path = auditPath();
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path,'utf8').trim().split('\n').filter(Boolean).slice(-Math.max(1,Math.min(limit,500))).reverse().map(line => JSON.parse(line));
  } catch { return []; }
}
