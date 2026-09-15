import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { loadSnapshot } from '@/lib/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const snapshot = await loadSnapshot();
  return NextResponse.json({ ok: true, user: session.u, ...snapshot }, { headers: { 'Cache-Control': 'no-store' } });
}
