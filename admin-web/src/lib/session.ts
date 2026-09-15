import { createHmac, timingSafeEqual } from 'node:crypto';
import type { StaffRole } from './rbac';
import { findStaff } from './staff';

const TTL_SECONDS = 8 * 60 * 60;
const ENROLL_TTL_SECONDS = 10 * 60;

export type AdminSession = { u: string; role: StaffRole; exp: number; kind: 'admin' };
type EnrollmentSession = { u: string; exp: number; kind: 'enroll' };

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!value) throw new Error('ADMIN_SESSION_SECRET is not configured');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(payload: AdminSession | EnrollmentSession) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode<T extends AdminSession | EnrollmentSession>(value?: string | null): T | null {
  if (!value) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;
  let expected: string;
  try { expected = sign(body); } catch { return null; }
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (!payload.u || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function createAdminSession(username: string, role: StaffRole): string {
  return encode({ u: username, role, kind: 'admin', exp: Math.floor(Date.now() / 1000) + TTL_SECONDS });
}

export function verifyAdminSession(value?: string | null): AdminSession | null {
  const payload = decode<AdminSession>(value);
  if (!payload || payload.kind !== 'admin' || !payload.role) return null;
  const staff = findStaff(payload.u);
  if (!staff || !staff.active || staff.role !== payload.role) return null;
  return payload;
}

export function createEnrollmentSession(username: string): string {
  return encode({ u: username, kind: 'enroll', exp: Math.floor(Date.now() / 1000) + ENROLL_TTL_SECONDS });
}

export function verifyEnrollmentSession(value?: string | null): EnrollmentSession | null {
  const payload = decode<EnrollmentSession>(value);
  return payload?.kind === 'enroll' ? payload : null;
}
