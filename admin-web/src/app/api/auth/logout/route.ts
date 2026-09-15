import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { audit, requestIp } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (session) audit({ actor: session.u, role: session.role, action: 'auth.logout', ip: requestIp(request) });
  const response = NextResponse.json({ ok: true });
  response.cookies.set('urtruck_admin_session', '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
  return response;
}
