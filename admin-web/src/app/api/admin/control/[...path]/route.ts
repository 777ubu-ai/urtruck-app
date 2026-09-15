import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { fetchControl } from '@/lib/backend';
import { can, permissionForControlResource } from '@/lib/rbac';
import { audit, requestIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { path } = await context.params;
  const resource = '/' + (path || []).map(encodeURIComponent).join('/');
  const permission = permissionForControlResource(resource);
  if (!permission) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  if (!can(session.role, permission)) {
    audit({ actor: session.u, role: session.role, action: 'control.denied', target: resource, success: false, ip: requestIp(request) });
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const query = request.nextUrl.search || '';
  const data = await fetchControl<Record<string, unknown>>(`${resource}${query}`);
  audit({ actor: session.u, role: session.role, action: 'control.view', target: resource, success: !!data, ip: requestIp(request) });
  if (!data) return NextResponse.json({ ok: false, error: 'backend_unavailable' }, { status: 502 });
  return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'no-store' } });
}
