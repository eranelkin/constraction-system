import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4501';

const REFRESH_COOKIE = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60,
  path: '/',
};

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const apiRes = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!apiRes.ok) {
    const res = NextResponse.json({ error: 'Session expired' }, { status: 401 });
    res.cookies.delete('refresh_token');
    return res;
  }

  const data = await apiRes.json() as { tokens: { accessToken: string; refreshToken: string } };
  const res = NextResponse.json({ tokens: { accessToken: data.tokens.accessToken } });
  res.cookies.set('refresh_token', data.tokens.refreshToken, REFRESH_COOKIE);
  return res;
}
