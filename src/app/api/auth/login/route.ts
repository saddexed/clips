import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { authSecret, isAuthConfigured } from '@/lib/auth';
import { allowLoginAttempt, clearLoginAttempts, clientAddress } from '@/lib/auth';
import { timingSafeEqual } from 'node:crypto';

export async function POST(req: Request) {
  try {
    const address = clientAddress(req);
    if (!allowLoginAttempt(address)) {
      return NextResponse.json({ error: 'Too many login attempts' }, { status: 429 });
    }

    const { password } = await req.json();

    const adminPassword = process.env.ADMIN_PASSWORD?.trim();

    const supplied = typeof password === 'string' ? Buffer.from(password) : Buffer.alloc(0);
    const expected = Buffer.from(adminPassword || "");
    const passwordMatches = supplied.length === expected.length && timingSafeEqual(supplied, expected);

    if (!isAuthConfigured() || !passwordMatches) {
      if (!isAuthConfigured()) {
        return NextResponse.json({ error: 'Authentication is not configured' }, { status: 503 });
      }
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    clearLoginAttempts(address);

    const token = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d') // 7 days expiration best practice
      .sign(authSecret());

    // Set token in HTTP-only cookie
    const response = NextResponse.json({ success: true });
    
    // Cookie valid for 7 days in ms
    const maxAge = 7 * 24 * 60 * 60;
    
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: maxAge,
      path: '/'
    });

    return response;

  } catch (error) {
    console.error('[Login API] Error verifying password:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
