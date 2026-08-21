import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SESSION_COOKIE } from '@/lib/demoAuth';

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/demo/login', request.url), { status: 303 });
  response.cookies.delete(DEMO_SESSION_COOKIE);
  return response;
}
