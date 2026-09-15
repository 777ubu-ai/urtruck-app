import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/session';
import { can } from '@/lib/rbac';
import { audit, readAudit, requestIp } from '@/lib/audit';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
  const session=verifyAdminSession(request.cookies.get('urtruck_admin_session')?.value);
  if(!session) return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  if(!can(session.role,'audit_read')) return NextResponse.json({ok:false,error:'forbidden'},{status:403});
  const raw=Number(request.nextUrl.searchParams.get('limit')||200);
  const limit=Number.isFinite(raw)?Math.max(1,Math.min(raw,500)):200;
  const events=readAudit(limit);
  audit({actor:session.u,role:session.role,action:'audit.read',target:`limit=${limit}`,ip:requestIp(request)});
  return NextResponse.json({ok:true,events},{headers:{'Cache-Control':'no-store'}});
}
