import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSession, verifyEnrollmentSession } from '@/lib/session';
import { activateStaff } from '@/lib/staff';
import { audit, requestIp } from '@/lib/audit';
import { LoginGuardUnavailable, loginAllowed, loginFailure, loginSuccess } from '@/lib/loginGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { otp?: string } = {};
  try { body = await request.json(); } catch {}
  const otp = String(body.otp || '').trim();
  const enrollment = verifyEnrollmentSession(request.cookies.get('urtruck_admin_enroll')?.value);
  if (!enrollment) return NextResponse.json({ ok: false, error: 'Сессия настройки MFA истекла. Войдите снова.' }, { status: 401 });
  const ip = requestIp(request);
  let gate;
  try { gate = loginAllowed(ip, enrollment.u); } catch (error) {
    if (error instanceof LoginGuardUnavailable) return NextResponse.json({ ok:false, error:'Сервис входа временно недоступен' }, { status:503 });
    throw error;
  }
  if (!gate.allowed) return NextResponse.json({ ok:false, error:'Слишком много неудачных попыток. Попробуйте позже.' }, { status:429, headers:{ 'Retry-After': String(gate.retryAfter) } });
  const staff = activateStaff(enrollment.u, otp);
  if (!staff) {
    loginFailure(ip, enrollment.u);
    audit({ actor: enrollment.u, action: 'auth.mfa_enrollment_failed', success: false, ip });
    return NextResponse.json({ ok: false, error: 'Неверный 6-значный код' }, { status: 401 });
  }
  loginSuccess(ip, enrollment.u);
  const response = NextResponse.json({ ok: true, role: staff.role });
  response.cookies.set('urtruck_admin_session', createAdminSession(staff.username, staff.role), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: ADMIN_SESSION_MAX_AGE_SECONDS
  });
  response.cookies.set('urtruck_admin_enroll', '', { httpOnly: true, path: '/api/auth', maxAge: 0, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
  audit({ actor: staff.username, role: staff.role, action: 'auth.mfa_enrolled', ip });
  return response;
}
