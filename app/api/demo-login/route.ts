import { NextRequest, NextResponse } from 'next/server';
import { createEncryptedSessionToken, DEMO_PASSWORD, DEMO_SESSION_COOKIE, DEMO_USERNAME } from '@/lib/demoAuth';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const username = form.get('username');
  const password = form.get('password');

  if (username !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
    return NextResponse.redirect(new URL('/demo/login?error=1', request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL('/demo/protected', request.url), { status: 303 });
  // An AES-256-GCM-encrypted token, not a plain "ok" flag - see
  // lib/demoAuth.ts for why, and how storageState still works against it.
  response.cookies.set(DEMO_SESSION_COOKIE, createEncryptedSessionToken(username), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}
