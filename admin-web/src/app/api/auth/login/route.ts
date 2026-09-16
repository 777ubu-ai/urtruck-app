import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSession, createEnrollmentSession } from '@/lib/session';
import { validateBackendAdmin } from '@/lib/backend';
import {
  activateStaffPasswordOnly, bootstrapOwner, provisioningUri, staffCount,
  verifyStaffLogin, verifyStaffPassword
} from '@/lib/staff';
import { audit, requestIp } from '@/lib/audit';
import { LoginGuardUnavailable, loginAllowed, loginFailure, loginSuccess } from '@/lib/loginGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sessionCookie(response: NextResponse, token: string) {
  response.cookies.set('urtruck_admin_session', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: ADMIN_SESSION_MAX_AGE_SECONDS
  });
}

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string; otp?: string } = {};
  try { body = await request.json(); } catch {}
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const otp = String(body.otp || '').trim();
  const ip = requestIp(request);
  const mfaRequiredByPolicy = String(process.env.ADMIN_REQUIRE_MFA || 'true').toLowerCase() !== 'false';
  if (!username || !password) return NextResponse.json({ ok: false, error: 'Введите логин и пароль' }, { status: 400 });

  let gate;
  try { gate = loginAllowed(ip, username); } catch (error) {
    if (error instanceof LoginGuardUnavailable) return NextResponse.json({ ok:false, error:'Сервис входа временно недоступен' }, { status:503 });
    throw error;
  }
  if (!gate.allowed) return NextResponse.json({ ok:false, error:'Слишком много неудачных попыток. Попробуйте позже.' }, { status:429, headers:{ 'Retry-After': String(gate.retryAfter) } });

  let staff = null;
  if (staffCount() === 0) {
    const legacyOk = await validateBackendAdmin(username, password);
    if (!legacyOk) {
      loginFailure(ip, username);
      audit({ actor: username, action: 'auth.bootstrap_failed', success: false, ip });
      return NextResponse.json({ ok: false, error: 'Неверные данные или backend недоступен' }, { status: 401 });
    }
    staff = bootstrapOwner(username, password);
  } else {
    staff = verifyStaffPassword(username, password);
  }

  if (!staff) {
    loginFailure(ip, username);
    audit({ actor: username, action: 'auth.password_failed', success: false, ip });
    return NextResponse.json({ ok: false, error: 'Неверные данные' }, { status: 401 });
  }

  if (!staff.mfaEnrolledAt && mfaRequiredByPolicy) {
    const uri = provisioningUri(staff);
    const qrDataUrl = await QRCode.toDataURL(uri, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
    const response = NextResponse.json({ ok: false, mfaSetupRequired: true, qrDataUrl });
    response.cookies.set('urtruck_admin_enroll', createEnrollmentSession(staff.username), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
      path: '/api/auth', maxAge: 10 * 60
    });
    audit({ actor: staff.username, role: staff.role, action: 'auth.mfa_enrollment_started', ip });
    return response;
  }

  if (!mfaRequiredByPolicy && !staff.active) {
    staff = activateStaffPasswordOnly(staff.username);
  }

  if (!staff || !staff.active) {
    audit({ actor: username, role: staff?.role || '', action: 'auth.disabled_account', success: false, ip });
    return NextResponse.json({ ok: false, error: 'Доступ отключён администратором' }, { status: 403 });
  }

  if (!mfaRequiredByPolicy) {
    loginSuccess(ip, username);
    const response = NextResponse.json({ ok: true, role: staff.role });
    sessionCookie(response, createAdminSession(staff.username, staff.role));
    audit({ actor: staff.username, role: staff.role, action: 'auth.login_password_only', ip });
    return response;
  }

  if (!otp) return NextResponse.json({ ok: false, mfaRequired: true });
  const verified = verifyStaffLogin(username, password, otp);
  if (!verified) {
    loginFailure(ip, username);
    audit({ actor: username, role: staff.role, action: 'auth.mfa_failed', success: false, ip });
    return NextResponse.json({ ok: false, error: 'Неверный код Authenticator' }, { status: 401 });
  }

  loginSuccess(ip, username);
  const response = NextResponse.json({ ok: true, role: verified.role });
  sessionCookie(response, createAdminSession(verified.username, verified.role));
  audit({ actor: verified.username, role: verified.role, action: 'auth.login', ip });
  return response;
}
