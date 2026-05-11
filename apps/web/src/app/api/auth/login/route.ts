import { NextRequest, NextResponse } from 'next/server';
import type { AuthUser } from '@constractor/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4501';

const REFRESH_COOKIE = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60,
  path: '/',
};

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;

  const apiRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await apiRes.json() as
    | { user: AuthUser; tokens: { accessToken: string; refreshToken: string } }
    | { error: string };

  if (!apiRes.ok) return NextResponse.json(data, { status: apiRes.status });

  const { user, tokens } = data as { user: AuthUser; tokens: { accessToken: string; refreshToken: string } };
  const res = NextResponse.json({ user, tokens: { accessToken: tokens.accessToken } });
  res.cookies.set('refresh_token', tokens.refreshToken, REFRESH_COOKIE);
  return res;
}
