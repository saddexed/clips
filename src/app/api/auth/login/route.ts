import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    const adminPassword = process.env.ADMIN_PASSWORD;

    // If admin password isn't set, act as if auth is disabled
    if (!adminPassword || password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Sign the token with a secure secret
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback_secret_for_dev_only');
    
    const token = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d') // 7 days expiration best practice
      .sign(secret);

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
