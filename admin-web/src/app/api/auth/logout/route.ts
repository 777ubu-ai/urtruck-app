import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('urtruck_admin_session', '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
  return response;
}
