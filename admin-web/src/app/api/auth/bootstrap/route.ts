import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { activateStaffPasswordOnly, bootstrapOwner, provisioningUri, resetOwnerPassword, staffCount } from '@/lib/staff';
import { createAdminSession, createEnrollmentSession } from '@/lib/session';
import { audit, requestIp } from '@/lib/audit';
import { clearLoginGuard } from '@/lib/loginGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dataFile(name:string){ return join(process.cwd(), '.admin-data', name); }
function resetMarker(){ return dataFile('owner-reset.used'); }
function gateMarker(){ return dataFile('owner-reset.enabled'); }
function gateIpFile(){ return dataFile('owner-reset-ip'); }
function markResetUsed(){ const p=resetMarker(); mkdirSync(dirname(p),{recursive:true,mode:0o700}); writeFileSync(p,new Date().toISOString(),{mode:0o600}); for(const f of [gateMarker(),gateIpFile()]){ try{unlinkSync(f);}catch{} } }

export async function POST(request: NextRequest) {
  const ip = requestIp(request);
  const fileGate = existsSync(gateMarker());
  const fileIp = existsSync(gateIpFile()) ? readFileSync(gateIpFile(),'utf8').trim() : '';
  const allowedIp = String(process.env.ADMIN_BOOTSTRAP_IP || fileIp).trim();
  const enabled = String(process.env.ADMIN_BOOTSTRAP_ENABLED || '').toLowerCase() === 'true' || fileGate;
  const resetEnabled = String(process.env.ADMIN_OWNER_RESET_ENABLED || '').toLowerCase() === 'true' || fileGate;
  const mfaRequired = String(process.env.ADMIN_REQUIRE_MFA || 'true').toLowerCase() !== 'false';
  if (!enabled || !allowedIp || ip !== allowedIp) return NextResponse.json({ ok:false, error:'bootstrap_unavailable' }, { status:404 });

  let body: { password?: string } = {};
  try { body = await request.json(); } catch {}
  const password = String(body.password || '');
  if (password.length < 12) return NextResponse.json({ ok:false, error:'Пароль должен быть не короче 12 символов' }, { status:400 });

  try {
    if (staffCount() > 0) {
      if (!resetEnabled || existsSync(resetMarker())) return NextResponse.json({ ok:false, error:'Сброс Owner уже использован. Используйте обычный вход.' }, { status:409 });
      const staff = resetOwnerPassword('admin', password);
      clearLoginGuard(ip, 'admin'); markResetUsed();
      audit({ actor:'admin', role:'owner', action:'auth.owner_password_reset', ip });
      if (!mfaRequired) {
        const response = NextResponse.json({ ok:true, username:'admin', loggedIn:true });
        response.cookies.set('urtruck_admin_session', createAdminSession(staff.username, staff.role), { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict', path:'/', maxAge:8*60*60 });
        return response;
      }
      return NextResponse.json({ ok:true, username:'admin', resetComplete:true });
    }

    const staff = bootstrapOwner('admin', password);
    if (!staff) return NextResponse.json({ ok:false, error:'Владелец уже создан.' }, { status:409 });
    if (!mfaRequired) {
      const activeStaff = activateStaffPasswordOnly(staff.username) || staff;
      const response = NextResponse.json({ ok:true, username:'admin', loggedIn:true });
      response.cookies.set('urtruck_admin_session', createAdminSession(activeStaff.username, activeStaff.role), { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict', path:'/', maxAge:8*60*60 });
      return response;
    }
    const qrDataUrl = await QRCode.toDataURL(provisioningUri(staff), { width:260, margin:1, errorCorrectionLevel:'M' });
    const response = NextResponse.json({ ok:true, username:'admin', qrDataUrl });
    response.cookies.set('urtruck_admin_enroll', createEnrollmentSession('admin'), { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict', path:'/api/auth', maxAge:10*60 });
    audit({ actor:'admin', role:'owner', action:'auth.bootstrap_owner_created', ip });
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'bootstrap_failed';
    return NextResponse.json({ ok:false, error:code==='password_too_short'?'Пароль должен быть не короче 12 символов':'Не удалось обновить Owner' }, { status:400 });
  }
}
