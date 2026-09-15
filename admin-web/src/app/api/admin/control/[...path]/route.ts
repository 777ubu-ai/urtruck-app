import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { fetchControl } from '@/lib/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { path } = await context.params;
  const resource = '/' + (path || []).map(encodeURIComponent).join('/');
  const allowed = new Set(['/online', '/deals', '/chats', '/users']);
  if (!allowed.has(resource)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const query = request.nextUrl.search || '';
  const data = await fetchControl<Record<string, unknown>>(`${resource}${query}`);
  if (!data) return NextResponse.json({ ok: false, error: 'backend_unavailable' }, { status: 502 });
  return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'no-store' } });
}
