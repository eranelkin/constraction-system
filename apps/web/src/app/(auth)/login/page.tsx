'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { saveSession } from '@/lib/auth/session';
import type { AuthResponseDTO } from '@constractor/types';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    try {
      const result = await apiRequest<AuthResponseDTO>('/auth/login', {
        method: 'POST',
        body: {
          email: form.get('email'),
          password: form.get('password'),
        },
      });
      if (result.user.role === 'member') {
        setError('This portal is for managers only. Please use the mobile app.');
        return;
      }
      saveSession(result.user, result.tokens);
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
              />
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
              />
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
