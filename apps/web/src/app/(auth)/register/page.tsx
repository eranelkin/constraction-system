'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { saveSession } from '@/lib/auth/session';
import type { AuthResponseDTO } from '@constractor/types';

type Role = 'client' | 'contractor';

const ROLES: { value: Role; emoji: string; label: string; desc: string }[] = [
  { value: 'client',     emoji: '🏢', label: 'Manager',    desc: 'Post jobs & manage teams' },
  { value: 'contractor', emoji: '👷', label: 'Worker',     desc: 'Take jobs on site' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('contractor');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    try {
      const result = await apiRequest<AuthResponseDTO>('/auth/register', {
        method: 'POST',
        body: {
          email: form.get('email'),
          password: form.get('password'),
          displayName: form.get('displayName'),
          role,
        },
      });
      saveSession(result.user, result.tokens);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
            <Link href="/login" className="auth-tab">Sign In</Link>
            <span className="auth-tab active">Sign Up</span>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Role picker */}
            <div>
              <label className="field-label">I am a…</label>
              <div className="role-grid">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`role-card ${role === r.value ? 'selected' : ''}`}
                    onClick={() => setRole(r.value)}
                  >
                    <span className="role-emoji">{r.emoji}</span>
                    <span className="role-label">{r.label}</span>
                    <span className="role-desc">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="displayName">Full Name</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                placeholder="John Smith"
                className="comic-input"
                autoComplete="name"
              />
            </div>

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
                minLength={8}
                placeholder="Min. 8 characters"
                className="comic-input"
                autoComplete="new-password"
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
                <><span className="spinner" />Creating account…</>
              ) : (
                '🚀 Create Account'
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: '#666' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#FF6B2B', fontWeight: 700, textDecoration: 'none' }}>
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
