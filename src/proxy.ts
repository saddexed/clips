import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function proxy(req: NextRequest) {
  // Only enforce login if ADMIN_PASSWORD is actually set in the environment
  // If it's empty/missing, the user opted out of security.
  if (!process.env.ADMIN_PASSWORD) {
     return NextResponse.next();
  }

  const token = req.cookies.get('admin_session')?.value;
  const host = req.headers.get('host') || `localhost:${process.env.PORT || '3000'}`;
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const loginUrl = new URL('/login', `${protocol}://${host}`);

  if (!token) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback_secret_for_dev_only');
    // jwtVerify handles expiration automatically if 'exp' is set in the JWT
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (error) {
    console.error('[Middleware] JWT verification failed:', error);
    // If the token is invalid or expired, clear the cookie and redirect to login
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('admin_session');
    return response;
  }
}

export const config = {
  // Only apply to admin routes. By not catching /api/upload here, we bypass Next.js Edge Middleware's 
  // aggressive 10MB payload size limits so large videos don't crash instantly.
  matcher: ['/admin/:path*'],
};
