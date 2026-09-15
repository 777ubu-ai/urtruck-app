import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { loadSnapshot } from '@/lib/backend';
import { can } from '@/lib/rbac';
import { audit, requestIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!can(session.role, 'dashboard')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const snapshot = await loadSnapshot();
  audit({ actor: session.u, role: session.role, action: 'control.view', target: '/summary', success: snapshot.backend.ok, ip: requestIp(request) });
  return NextResponse.json({ ok: true, user: session.u, role: session.role, ...snapshot }, { headers: { 'Cache-Control': 'no-store' } });
}
