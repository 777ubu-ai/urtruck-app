import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { can, isStaffRole, STAFF_ROLES } from '@/lib/rbac';
import { createStaff, listStaff, setStaffActive } from '@/lib/staff';
import { audit, requestIp } from '@/lib/audit';

function session(request: NextRequest) {
  return verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
}

export async function GET(request: NextRequest) {
  const s = session(request);
  if (!s) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!can(s.role, 'staff_read')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  audit({ actor: s.u, role: s.role, action: 'staff.list', ip: requestIp(request) });
  return NextResponse.json({ ok: true, staff: listStaff(), roles: STAFF_ROLES });
}

export async function POST(request: NextRequest) {
  const s = session(request);
  if (!s) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!can(s.role, 'staff_manage')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  let body: { username?: string; password?: string; role?: string } = {};
  try { body = await request.json(); } catch {}
  if (!isStaffRole(body.role)) return NextResponse.json({ ok: false, error: 'Некорректная роль' }, { status: 400 });
  try {
    const created = createStaff(String(body.username || ''), String(body.password || ''), body.role);
    audit({ actor: s.u, role: s.role, action: 'staff.create', target: created.username, ip: requestIp(request), detail: `role=${created.role}` });
    return NextResponse.json({ ok: true, username: created.username, role: created.role, mfaSetupRequired: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'staff_create_failed';
    const messages: Record<string,string> = { invalid_username:'Логин слишком короткий', password_too_short:'Пароль должен быть не короче 12 символов', staff_exists:'Такой сотрудник уже существует' };
    return NextResponse.json({ ok: false, error: messages[code] || 'Не удалось создать сотрудника' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const s = session(request);
  if (!s) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!can(s.role, 'staff_manage')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  let body: { username?: string; active?: boolean } = {};
  try { body = await request.json(); } catch {}
  try {
    const target = setStaffActive(String(body.username || ''), body.active === true);
    audit({ actor: s.u, role: s.role, action: body.active ? 'staff.enable' : 'staff.disable', target: target.username, ip: requestIp(request) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'staff_update_failed';
    const message = code === 'last_owner' ? 'Нельзя отключить последнего активного Owner' : code === 'mfa_not_enrolled' ? 'Сначала сотрудник должен подключить MFA при первом входе' : 'Сотрудник не найден';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
