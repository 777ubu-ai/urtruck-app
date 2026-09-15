import { NextRequest, NextResponse } from 'next/server';
import { createAdminSession, verifyEnrollmentSession } from '@/lib/session';
import { activateStaff } from '@/lib/staff';
import { audit, requestIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { otp?: string } = {};
  try { body = await request.json(); } catch {}
  const otp = String(body.otp || '').trim();
  const enrollment = verifyEnrollmentSession(request.cookies.get('urtruck_admin_enroll')?.value);
  if (!enrollment) return NextResponse.json({ ok: false, error: 'Сессия настройки MFA истекла. Войдите снова.' }, { status: 401 });
  const staff = activateStaff(enrollment.u, otp);
  if (!staff) {
    audit({ actor: enrollment.u, action: 'auth.mfa_enrollment_failed', success: false, ip: requestIp(request) });
    return NextResponse.json({ ok: false, error: 'Неверный 6-значный код' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, role: staff.role });
  response.cookies.set('urtruck_admin_session', createAdminSession(staff.username, staff.role), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: 8 * 60 * 60
  });
  response.cookies.set('urtruck_admin_enroll', '', { httpOnly: true, path: '/api/auth', maxAge: 0, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
  audit({ actor: staff.username, role: staff.role, action: 'auth.mfa_enrolled', ip: requestIp(request) });
  return response;
}
