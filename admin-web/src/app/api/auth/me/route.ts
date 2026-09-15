import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, username: session.u, role: session.role, roleLabel: ROLE_LABELS[session.role] });
}
