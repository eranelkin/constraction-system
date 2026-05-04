'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, clearSession } from '@/lib/auth/session';
import type { AuthUser } from '@constractor/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4501';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member',
};

function UserAvatar({ userId, displayName }: { userId: string; displayName: string }) {
  const [failed, setFailed] = useState(false);
  const initials = displayName.charAt(0).toUpperCase();
  return failed ? (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: 'var(--orange)', border: '2px solid rgba(255,255,255,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.8rem', fontWeight: 900, color: '#fff', flexShrink: 0,
    }}>
      {initials}
    </div>
  ) : (
    <img
      src={`${API_URL}/users/${userId}/avatar`}
      alt={displayName}
      onError={() => setFailed(true)}
      style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.4)',
        objectFit: 'cover', flexShrink: 0,
      }}
    />
  );
}

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
        gap: '1rem',
        height: '60px',
      }}>
        {/* Logo + Tabs grouped on the left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginRight: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <span style={{ fontSize: '1.4rem' }}>🏗️</span>
            <span style={{ color: 'var(--yellow)', fontWeight: 900, fontSize: '1.1rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Constractor
            </span>
          </div>

          {/* Tabs */}
          <nav style={{ display: 'flex', gap: '0.25rem' }}>
          <Link href="/manage/dashboard" style={{
            padding: '0.4rem 1.2rem',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: pathname.startsWith('/manage/dashboard') ? 'var(--orange)' : 'transparent',
            color: pathname.startsWith('/manage/dashboard') ? '#fff' : 'rgba(255,255,255,0.65)',
            border: pathname.startsWith('/manage/dashboard') ? 'var(--border)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            📊 Dashboard
          </Link>
          <Link href="/manage/reports" style={{
            padding: '0.4rem 1.2rem',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: pathname.startsWith('/manage/reports') ? 'var(--orange)' : 'transparent',
            color: pathname.startsWith('/manage/reports') ? '#fff' : 'rgba(255,255,255,0.65)',
            border: pathname.startsWith('/manage/reports') ? 'var(--border)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            📋 Reports
          </Link>
          <Link href="/manage/schedule" style={{
            padding: '0.4rem 1.2rem',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: pathname.startsWith('/manage/schedule') ? 'var(--orange)' : 'transparent',
            color: pathname.startsWith('/manage/schedule') ? '#fff' : 'rgba(255,255,255,0.65)',
            border: pathname.startsWith('/manage/schedule') ? 'var(--border)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            📅 Schedule
          </Link>
          <Link href="/manage/rfis" style={{
            padding: '0.4rem 1.2rem',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: pathname.startsWith('/manage/rfis') ? 'var(--orange)' : 'transparent',
            color: pathname.startsWith('/manage/rfis') ? '#fff' : 'rgba(255,255,255,0.65)',
            border: pathname.startsWith('/manage/rfis') ? 'var(--border)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            📄 RFIs
          </Link>
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
          <Link href="/manage/groups" style={{
            padding: '0.4rem 1.2rem',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: pathname.startsWith('/manage/groups') ? 'var(--orange)' : 'transparent',
            color: pathname.startsWith('/manage/groups') ? '#fff' : 'rgba(255,255,255,0.65)',
            border: pathname.startsWith('/manage/groups') ? 'var(--border)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            🏘️ Groups
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
        </div>

        {/* User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <UserAvatar userId={user.id} displayName={user.displayName} />
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
