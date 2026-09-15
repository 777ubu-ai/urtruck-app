import { NextResponse } from 'next/server';
import { createAdminSession } from '@/lib/session';
import { validateBackendAdmin } from '@/lib/backend';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { username?: string; password?: string } = {};
  try { body = await request.json(); } catch {}
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return NextResponse.json({ ok: false, error: 'Введите логин и пароль' }, { status: 400 });

  const ok = await validateBackendAdmin(username, password);
  if (!ok) return NextResponse.json({ ok: false, error: 'Неверные данные или backend недоступен' }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  let token: string;
  try { token = createAdminSession(username); }
  catch { return NextResponse.json({ ok: false, error: 'ADMIN_SESSION_SECRET не настроен' }, { status: 503 }); }
  response.cookies.set('urtruck_admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60
  });
  return response;
}
