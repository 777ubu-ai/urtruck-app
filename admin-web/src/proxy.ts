import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { can, type Permission } from '@/lib/rbac';

const pages: Record<string, Permission> = { '/':'dashboard', '/online':'online', '/users':'users', '/deals':'deals', '/chats':'chats', '/system':'system', '/staff':'staff_read' };

export function proxy(request: NextRequest) {
  const session = verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if (!session) { const login=request.nextUrl.clone(); login.pathname='/login'; login.search=''; return NextResponse.redirect(login); }
  const permission=pages[request.nextUrl.pathname];
  if (permission && !can(session.role, permission)) { const home=request.nextUrl.clone(); home.pathname='/'; home.search=''; return NextResponse.redirect(home); }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api/|login$|_next/|favicon.ico).*)'] };
