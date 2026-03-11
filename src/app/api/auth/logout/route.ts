import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const host = req.headers.get('host') || 'localhost:6119';
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  
  const response = NextResponse.redirect(new URL('/', `${protocol}://${host}`));
  response.cookies.delete('admin_session');
  return response;
}
