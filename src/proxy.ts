import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAuthConfigured, verifyAdminToken } from '@/lib/auth';

export async function proxy(req: NextRequest) {
  const token = req.cookies.get('admin_session')?.value;
  const loginUrl = new URL('/login', req.url);

  if (!isAuthConfigured() || !(await verifyAdminToken(token))) {
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('admin_session');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
