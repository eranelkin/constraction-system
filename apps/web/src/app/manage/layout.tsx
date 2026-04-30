'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, clearSession } from '@/lib/auth/session';
import type { AuthUser } from '@constractor/types';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member',
};

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored || stored.role === 'member') {
      router.replace('/login');
      return;
    }
    setUser(stored);
  }, [router]);

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top nav */}
      <header style={{
        background: 'var(--navy)',
        borderBottom: '3px solid var(--orange)',
        padding: '0 2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
        height: '60px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: 'auto' }}>
          <span style={{ fontSize: '1.4rem' }}>🏗️</span>
          <span style={{ color: 'var(--yellow)', fontWeight: 900, fontSize: '1.1rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Constractor
          </span>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', gap: '0.25rem' }}>
          <Link href="/manage/users" style={{
            padding: '0.4rem 1.2rem',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: pathname.startsWith('/manage/users') ? 'var(--orange)' : 'transparent',
            color: pathname.startsWith('/manage/users') ? '#fff' : 'rgba(255,255,255,0.65)',
            border: pathname.startsWith('/manage/users') ? 'var(--border)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            👥 Users
          </Link>
          <Link href="/manage/tasks" style={{
            padding: '0.4rem 1.2rem',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: pathname.startsWith('/manage/tasks') ? 'var(--orange)' : 'transparent',
            color: pathname.startsWith('/manage/tasks') ? '#fff' : 'rgba(255,255,255,0.65)',
            border: pathname.startsWith('/manage/tasks') ? 'var(--border)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            ✅ Tasks
          </Link>
        </nav>

        {/* User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>
            {user.displayName}
          </span>
          <span style={{
            background: user.role === 'admin' ? 'var(--navy)' : 'var(--orange)',
            color: '#fff',
            border: '2px solid rgba(255,255,255,0.3)',
            borderRadius: 'var(--radius-pill)',
            padding: '0.15rem 0.6rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          <button
            onClick={handleLogout}
            className="comic-btn-secondary"
            style={{ padding: '0.3rem 0.9rem', fontSize: '0.8rem' }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Page content */}
      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
