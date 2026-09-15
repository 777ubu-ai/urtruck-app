import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createAdminSession, createEnrollmentSession } from '@/lib/session';
import { validateBackendAdmin } from '@/lib/backend';
import {
  bootstrapOwner, provisioningUri, staffCount,
  verifyStaffLogin, verifyStaffPassword
} from '@/lib/staff';
import { audit, requestIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sessionCookie(response: NextResponse, token: string) {
  response.cookies.set('urtruck_admin_session', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: 8 * 60 * 60
  });
}

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string; otp?: string } = {};
  try { body = await request.json(); } catch {}
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const otp = String(body.otp || '').trim();
  const ip = requestIp(request);
  if (!username || !password) return NextResponse.json({ ok: false, error: 'Введите логин и пароль' }, { status: 400 });

  let staff = null;
  if (staffCount() === 0) {
    const legacyOk = await validateBackendAdmin(username, password);
    if (!legacyOk) {
      audit({ actor: username, action: 'auth.bootstrap_failed', success: false, ip });
      return NextResponse.json({ ok: false, error: 'Неверные данные или backend недоступен' }, { status: 401 });
    }
    staff = bootstrapOwner(username, password);
  } else {
    staff = verifyStaffPassword(username, password);
  }

  if (!staff) {
    audit({ actor: username, action: 'auth.password_failed', success: false, ip });
    return NextResponse.json({ ok: false, error: 'Неверные данные' }, { status: 401 });
  }

  if (!staff.mfaEnrolledAt) {
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

  if (!staff.active) {
    audit({ actor: staff.username, role: staff.role, action: 'auth.disabled_account', success: false, ip });
    return NextResponse.json({ ok: false, error: 'Доступ отключён администратором' }, { status: 403 });
  }

  if (!otp) return NextResponse.json({ ok: false, mfaRequired: true });
  const verified = verifyStaffLogin(username, password, otp);
  if (!verified) {
    audit({ actor: username, role: staff.role, action: 'auth.mfa_failed', success: false, ip });
    return NextResponse.json({ ok: false, error: 'Неверный код Authenticator' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, role: verified.role });
  sessionCookie(response, createAdminSession(verified.username, verified.role));
  audit({ actor: verified.username, role: verified.role, action: 'auth.login', ip });
  return response;
}
