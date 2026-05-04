'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import type { ListUsersResponse, ListGroupsResponse, PublicUser, PublicGroup } from '@constractor/types';

const LANGUAGES: Record<string, string> = {
  en: '🇺🇸 English', he: '🇮🇱 Hebrew', ar: '🇸🇦 Arabic', ru: '🇷🇺 Russian',
  es: '🇪🇸 Spanish', fr: '🇫🇷 French', de: '🇩🇪 German', pt: '🇧🇷 Portuguese',
  ro: '🇷🇴 Romanian', tr: '🇹🇷 Turkish', zh: '🇨🇳 Chinese', hi: '🇮🇳 Hindi',
  am: '🇪🇹 Amharic', tl: '🇵🇭 Filipino',
};

function StatCard({ emoji, label, value, sub, accent }: {
  emoji: string; label: string; value: number | string; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      background: '#fff',
      border: 'var(--border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: accent ?? 'var(--navy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem', flexShrink: 0,
        border: 'var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {emoji}
      </div>
      <div>
        <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--navy)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#555', marginTop: '0.2rem' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.1rem' }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = () => getAccessToken() ?? '';

  const load = useCallback(async () => {
    try {
      const [uData, gData] = await Promise.all([
        apiRequest<ListUsersResponse>('/users', { token: token() }),
        apiRequest<ListGroupsResponse>('/groups', { token: token() }),
      ]);
      setUsers(uData.users);
      setGroups(gData.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const activeUsers = users.filter((u) => u.isActive);
  const admins = users.filter((u) => u.role === 'admin');
  const managers = users.filter((u) => u.role === 'manager');
  const members = users.filter((u) => u.role === 'member');

  const langCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.language] = (acc[u.language] ?? 0) + 1;
    return acc;
  }, {});
  const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);

  const totalMemberships = groups.reduce((sum, g) => sum + g.members.length, 0);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#999' }}>
        <span className="spinner" style={{ display: 'inline-block', marginRight: '0.5rem' }} />
        Loading dashboard…
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>Dashboard</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          Overview of your team, groups, and languages
        </p>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: '1.25rem' }}>⚠️ {error}</div>}

      {/* Top stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <StatCard emoji="👥" label="Total Users" value={users.length} sub={`${activeUsers.length} active`} />
        <StatCard emoji="🛡️" label="Admins" value={admins.length} accent="var(--navy)" />
        <StatCard emoji="💼" label="Managers" value={managers.length} accent="var(--orange)" />
        <StatCard emoji="👷" label="Members" value={members.length} accent="var(--yellow)" />
        <StatCard emoji="🏘️" label="Groups" value={groups.length} sub={`${totalMemberships} memberships`} accent="#4ECDC4" />
      </div>

      {/* Bottom row: language breakdown + inactive users */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

        {/* Language breakdown */}
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '1.25rem 1.5rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 900, color: 'var(--navy)' }}>
            🌍 Team Languages
          </h2>
          {sortedLangs.length === 0 ? (
            <p style={{ color: '#999', fontSize: '0.875rem' }}>No users yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sortedLangs.map(([code, count]) => {
                const pct = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
                return (
                  <div key={code}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--navy)' }}>
                        {LANGUAGES[code] ?? code}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 700 }}>
                        {count} · {pct}%
                      </span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: '#f0f0f0', border: '1.5px solid #e0e0e0', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--orange)', borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Groups breakdown */}
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '1.25rem 1.5rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 900, color: 'var(--navy)' }}>
            🏘️ Groups
          </h2>
          {groups.length === 0 ? (
            <p style={{ color: '#999', fontSize: '0.875rem' }}>
              No groups yet.{' '}
              <Link href="/manage/groups" style={{ color: 'var(--orange)', fontWeight: 700 }}>Create one →</Link>
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {groups.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', background: '#fafafa', border: '1.5px solid #eee' }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: g.color ?? 'var(--orange)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.9rem', flexShrink: 0, border: 'var(--border)',
                  }}>
                    {g.emoji ?? '🏘️'}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy)', flex: 1 }}>{g.name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 600 }}>
                    {g.members.length} member{g.members.length !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Inactive users warning */}
      {users.length - activeUsers.length > 0 && (
        <div style={{ marginTop: '1.25rem', background: '#fff8e1', border: '2.5px solid var(--yellow)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy)' }}>
            {users.length - activeUsers.length} user{users.length - activeUsers.length !== 1 ? 's are' : ' is'} inactive.{' '}
            <Link href="/manage/users" style={{ color: 'var(--orange)', textDecoration: 'none' }}>Manage in Users →</Link>
          </span>
        </div>
      )}
    </>
  );
}
