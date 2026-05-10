'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/auth/session';
import type { AuthUser } from '@constractor/types';

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = (form.get('email') as string).trim();
    const password = form.get('password') as string;

    const errors: Record<string, string> = {};
    if (!isValidEmail(email)) errors['email'] = 'Enter a valid email address.';
    if (!password) errors['password'] = 'Password is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const result = await res.json() as { user: AuthUser; tokens: { accessToken: string } } | { error: string };
      if (!res.ok) throw new Error((result as { error: string }).error);
      const { user, tokens } = result as { user: AuthUser; tokens: { accessToken: string } };
      if (user.role === 'member') {
        setError('This portal is for managers only. Please use the mobile app.');
        return;
      }
      saveSession(user, tokens.accessToken);
      router.push('/manage/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-card-header">
          <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '0.5rem' }}>🏗️</div>
          <div style={{
            fontSize: '1.75rem',
            fontWeight: 900,
            letterSpacing: '2px',
            color: '#FFD93D',
            textTransform: 'uppercase',
          }}>
            Constractor
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', marginTop: '0.25rem', letterSpacing: '0.5px' }}>
            Build · Manage · Deliver
          </div>
        </div>

        {/* Body */}
        <div className="auth-card-body">
          {/* Tabs */}
          <div className="auth-tabs">
            <span className="auth-tab active">Sign In</span>
            <Link href="/register" className="auth-tab">Sign Up</Link>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="comic-input"
                autoComplete="email"
                style={fieldErrors['email'] ? { borderColor: '#e53e3e' } : undefined}
                onChange={() => fieldErrors['email'] && setFieldErrors((p) => { const n = { ...p }; delete n['email']; return n; })}
              />
              {fieldErrors['email'] && <div style={{ color: '#e53e3e', fontSize: '0.78rem', marginTop: '0.25rem' }}>{fieldErrors['email']}</div>}
            </div>

            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="comic-input"
                autoComplete="current-password"
                style={fieldErrors['password'] ? { borderColor: '#e53e3e' } : undefined}
                onChange={() => fieldErrors['password'] && setFieldErrors((p) => { const n = { ...p }; delete n['password']; return n; })}
              />
              {fieldErrors['password'] && <div style={{ color: '#e53e3e', fontSize: '0.78rem', marginTop: '0.25rem' }}>{fieldErrors['password']}</div>}
            </div>

            {error && (
              <div className="error-banner">⚠️ {error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="comic-btn-primary"
              style={{ marginTop: '0.25rem' }}
            >
              {loading ? (
                <><span className="spinner" />Signing in…</>
              ) : (
                '🔑 Sign In'
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: '#666' }}>
            New to Constractor?{' '}
            <Link href="/register" style={{ color: '#FF6B2B', fontWeight: 700, textDecoration: 'none' }}>
              Create account →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
