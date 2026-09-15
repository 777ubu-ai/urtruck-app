import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';

export function proxy(request: NextRequest) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (!session) {
    const login = request.nextUrl.clone(); login.pathname = '/login'; login.search = '';
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api/|login$|_next/|favicon.ico).*)'] };
