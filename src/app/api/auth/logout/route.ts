import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const response = NextResponse.redirect(new URL('/', req.url));
  response.cookies.delete('admin_session');
  return response;
}
