import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { bootstrapOwner, provisioningUri, staffCount } from '@/lib/staff';
import { createEnrollmentSession } from '@/lib/session';
import { audit, requestIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ip = requestIp(request);
  const allowedIp = String(process.env.ADMIN_BOOTSTRAP_IP || '').trim();
  const enabled = String(process.env.ADMIN_BOOTSTRAP_ENABLED || '').toLowerCase() === 'true';
  if (!enabled || !allowedIp || ip !== allowedIp) return NextResponse.json({ ok:false, error:'bootstrap_unavailable' }, { status:404 });
  if (staffCount() > 0) return NextResponse.json({ ok:false, error:'Владелец уже создан. Используйте обычный вход.' }, { status:409 });

  let body: { password?: string } = {};
  try { body = await request.json(); } catch {}
  const password = String(body.password || '');
  if (password.length < 12) return NextResponse.json({ ok:false, error:'Пароль должен быть не короче 12 символов' }, { status:400 });

  try {
    const staff = bootstrapOwner('admin', password);
    if (!staff) return NextResponse.json({ ok:false, error:'Владелец уже создан.' }, { status:409 });
    const qrDataUrl = await QRCode.toDataURL(provisioningUri(staff), { width:260, margin:1, errorCorrectionLevel:'M' });
    const response = NextResponse.json({ ok:true, username:'admin', qrDataUrl });
    response.cookies.set('urtruck_admin_enroll', createEnrollmentSession('admin'), {
      httpOnly:true, secure:process.env.NODE_ENV === 'production', sameSite:'strict', path:'/api/auth', maxAge:10*60
    });
    audit({ actor:'admin', role:'owner', action:'auth.bootstrap_owner_created', ip });
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'bootstrap_failed';
    const message = code === 'password_too_short' ? 'Пароль должен быть не короче 12 символов' : 'Не удалось создать Owner';
    return NextResponse.json({ ok:false, error:message }, { status:400 });
  }
}
