'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import type {
  FieldReportWithReporter, FieldReportType,
  ScheduleTaskWithCreator,
  RfiWithUsers, RfiPriority,
  ListFieldReportsResponse, ListScheduleTasksResponse, ListRfisResponse, ListUsersResponse,
} from '@constractor/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isToday(d: Date | string): boolean {
  const date = new Date(d);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function relativeTime(d: Date | string): string {
  const date = new Date(d);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (isToday(date)) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso + 'T00:00:00');
  const diffDays = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (diffDays === 0)  return 'Today';
  if (diffDays === 1)  return 'Tomorrow';
  if (diffDays < 0)   return `${Math.abs(diffDays)}d overdue`;
  return `+${diffDays} days`;
}

const REPORT_TYPE_META: Record<FieldReportType, { icon: string; label: string }> = {
  safety:   { icon: '🔴', label: 'Safety' },
  issue:    { icon: '⚠️', label: 'Issue' },
  delay:    { icon: '🕐', label: 'Delay' },
  progress: { icon: '✅', label: 'Progress' },
};

const PRIORITY_COLORS: Record<RfiPriority, { bg: string; color: string; label: string }> = {
  critical: { bg: '#FEE2E2', color: '#B91C1C', label: 'CRITICAL' },
  high:     { bg: '#FEF3C7', color: '#92400E', label: 'HIGH' },
  medium:   { bg: '#DBEAFE', color: '#1E40AF', label: 'MED' },
  low:      { bg: '#DCFCE7', color: '#166534', label: 'LOW' },
};

// ── Activity item builder ─────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  icon: string;
  text: string;
  link: string;
  createdAt: Date;
}

function reportToActivity(r: FieldReportWithReporter): ActivityItem {
  const meta = REPORT_TYPE_META[r.type];
  const proj = r.project.split(' –')[0];
  const desc = r.description.length > 55 ? r.description.slice(0, 52) + '…' : r.description;
  return {
    id: `report-${r.id}`,
    icon: meta.icon,
    text: `${meta.label} report by ${r.reporterName} — ${proj}, ${r.location}: ${desc}`,
    link: '/manage/reports',
    createdAt: new Date(r.createdAt),
  };
}

function taskToActivity(t: ScheduleTaskWithCreator): ActivityItem {
  const icon = t.status === 'critical' ? '🔴' : t.status === 'delayed' ? '🟡' : '🟢';
  const proj = t.project.split(' –')[0];
  const delayPart = t.delayDays > 0 ? ` — delayed +${t.delayDays}d` : '';
  return {
    id: `task-${t.id}`,
    icon,
    text: `${t.taskName}${delayPart} · ${proj}`,
    link: '/manage/schedule',
    createdAt: new Date(t.createdAt),
  };
}

function rfiToActivity(r: RfiWithUsers): ActivityItem {
  const icon = r.priority === 'critical' ? '🔴' : r.priority === 'high' ? '🟡' : '📄';
  const statusLabel = r.status === 'answered' ? 'answered' : r.status === 'in-review' ? 'in review' : 'submitted';
  return {
    id: `rfi-${r.id}`,
    icon,
    text: `RFI #${r.number} ${statusLabel} — ${r.title}`,
    link: '/manage/rfis',
    createdAt: new Date(r.createdAt),
  };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ emoji, label, value, accent, sub }: {
  emoji: string; label: string; value: number | string; accent?: string; sub?: string;
}) {
  return (
    <div style={{
      background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)', padding: '1.1rem 1.4rem',
      display: 'flex', alignItems: 'center', gap: '0.9rem',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
        background: accent ?? 'var(--navy)', border: 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem',
      }}>
        {emoji}
      </div>
      <div>
        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#555', marginTop: '0.15rem' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: '#999' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const token = () => getAccessToken() ?? '';

  const [reports, setReports]   = useState<FieldReportWithReporter[]>([]);
  const [tasks, setTasks]       = useState<ScheduleTaskWithCreator[]>([]);
  const [rfis, setRfis]         = useState<RfiWithUsers[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rData, tData, fData, uData] = await Promise.all([
        apiRequest<ListRfisResponse>('/rfis', { token: token() }),
        apiRequest<ListScheduleTasksResponse>('/schedule-tasks', { token: token() }),
        apiRequest<ListFieldReportsResponse>('/field-reports', { token: token() }),
        apiRequest<ListUsersResponse>('/users', { token: token() }),
      ]);
      setRfis(rData.rfis);
      setTasks(tData.tasks);
      setReports(fData.reports);
      setUserCount(uData.users.filter((u) => u.isActive).length);
    } catch {
      // silently fail — dashboard shows zeroes rather than an error page
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const openRfiCount        = rfis.filter((r) => r.status === 'open').length;
  const criticalRfiCount    = rfis.filter((r) => r.priority === 'critical' && r.status !== 'closed').length;
  const criticalDelayCount  = tasks.filter((t) => t.status === 'critical' || t.status === 'delayed').length;
  const reportsToday        = reports.filter((r) => isToday(r.createdAt)).length;
  const openSafetyCount     = reports.filter((r) => r.type === 'safety' && r.status !== 'resolved').length;

  const projectSet = new Set([
    ...reports.map((r) => r.project),
    ...tasks.map((t) => t.project),
    ...rfis.map((r) => r.project ?? '').filter(Boolean),
  ]);
  const activeProjectCount = projectSet.size;

  const alertVisible = !dismissed && (criticalRfiCount > 0 || criticalDelayCount > 0 || openSafetyCount > 0);

  // ── Open RFIs panel — top 4 by priority ──────────────────────────────────────
  const PRIORITY_ORDER: Record<RfiPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const panelRfis = rfis
    .filter((r) => r.status === 'open' || r.status === 'in-review')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 4);

  // ── Activity feed — 8 most recent events across all three datasets ────────────
  const activityFeed: ActivityItem[] = [
    ...reports.map(reportToActivity),
    ...tasks.map(taskToActivity),
    ...rfis.map(rfiToActivity),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  if (loading) return (
    <div style={{ padding: '2rem', color: '#666', fontSize: '0.9rem' }}>Loading dashboard…</div>
  );

  return (
    <div>

      {/* ── Alert strip ──────────────────────────────────────────────────── */}
      {alertVisible && (
        <div style={{
          background: '#FEE2E2', border: '2.5px solid #B91C1C',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '1.1rem' }}>🚨</span>
          <span style={{ fontWeight: 800, color: '#B91C1C', fontSize: '0.9rem' }}>Attention required:</span>
          {criticalRfiCount > 0 && (
            <Link href="/manage/rfis" style={{
              background: '#B91C1C', color: '#fff', borderRadius: 'var(--radius-pill)',
              padding: '0.2rem 0.75rem', fontSize: '0.8rem', fontWeight: 800,
              textDecoration: 'none', border: '2px solid #7F1D1D',
            }}>
              🔴 {criticalRfiCount} Critical RFI{criticalRfiCount !== 1 ? 's' : ''}
            </Link>
          )}
          {criticalDelayCount > 0 && (
            <Link href="/manage/schedule" style={{
              background: '#D97706', color: '#fff', borderRadius: 'var(--radius-pill)',
              padding: '0.2rem 0.75rem', fontSize: '0.8rem', fontWeight: 800,
              textDecoration: 'none', border: '2px solid #92400E',
            }}>
              🟡 {criticalDelayCount} Delayed Task{criticalDelayCount !== 1 ? 's' : ''}
            </Link>
          )}
          {openSafetyCount > 0 && (
            <Link href="/manage/reports" style={{
              background: '#7C3AED', color: '#fff', borderRadius: 'var(--radius-pill)',
              padding: '0.2rem 0.75rem', fontSize: '0.8rem', fontWeight: 800,
              textDecoration: 'none', border: '2px solid #4C1D95',
            }}>
              🔴 {openSafetyCount} Safety Report{openSafetyCount !== 1 ? 's' : ''}
            </Link>
          )}
          <button
            onClick={() => setDismissed(true)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#B91C1C', fontWeight: 900 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Page title ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>Command Centre</h1>
        <p style={{ margin: '0.2rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          Live overview · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard emoji="🏗️" label="Active Projects"  value={activeProjectCount} accent="#4ECDC4" />
        <StatCard emoji="📄" label="Open RFIs"        value={openRfiCount}       accent="var(--orange)" />
        <StatCard emoji="⚠️" label="Delayed Tasks"    value={criticalDelayCount} accent="#EF4444" />
        <StatCard emoji="📋" label="Reports Today"    value={reportsToday}       accent="var(--yellow)" />
        <StatCard emoji="👷" label="Team Members"     value={userCount}          accent="#6366F1" />
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)', padding: '1rem 1.25rem',
        display: 'flex', gap: '0.75rem', alignItems: 'center',
        marginBottom: '1.5rem', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.25rem' }}>Quick</span>
        <Link href="/manage/reports" style={{
          background: 'var(--orange)', color: '#fff', border: 'var(--border)',
          borderRadius: 'var(--radius-pill)', padding: '0.45rem 1.1rem',
          fontSize: '0.875rem', fontWeight: 800, textDecoration: 'none',
          boxShadow: 'var(--shadow-sm)',
        }}>
          + Field Report
        </Link>
        <Link href="/manage/rfis" style={{
          background: 'var(--navy)', color: '#fff', border: 'var(--border)',
          borderRadius: 'var(--radius-pill)', padding: '0.45rem 1.1rem',
          fontSize: '0.875rem', fontWeight: 800, textDecoration: 'none',
          boxShadow: 'var(--shadow-sm)',
        }}>
          + New RFI
        </Link>
        <Link href="/manage/schedule" style={{
          background: '#D97706', color: '#fff', border: 'var(--border)',
          borderRadius: 'var(--radius-pill)', padding: '0.45rem 1.1rem',
          fontSize: '0.875rem', fontWeight: 800, textDecoration: 'none',
          boxShadow: 'var(--shadow-sm)',
        }}>
          + Log Delay
        </Link>
        <Link href="/manage/schedule" style={{
          background: '#fff', color: 'var(--navy)', border: 'var(--border)',
          borderRadius: 'var(--radius-pill)', padding: '0.45rem 1.1rem',
          fontSize: '0.875rem', fontWeight: 800, textDecoration: 'none',
          boxShadow: 'var(--shadow-sm)',
        }}>
          📅 View Schedule
        </Link>
      </div>

      {/* ── Two column body ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem' }}>

        {/* Activity feed */}
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--navy)', padding: '0.75rem 1.25rem' }}>
            <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ⚡ Activity Feed
            </h2>
          </div>
          {activityFeed.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '0.9rem' }}>
              No activity yet — submit a report, log a delay, or create an RFI to get started.
            </div>
          ) : (
            <div>
              {activityFeed.map((item, i) => (
                <Link
                  key={item.id}
                  href={item.link}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                    padding: '0.8rem 1.25rem',
                    borderBottom: i < activityFeed.length - 1 ? '1px solid #f0f0f0' : 'none',
                    textDecoration: 'none', background: 'transparent', transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: '1rem', marginTop: '0.05rem', flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--navy)', fontWeight: 500, lineHeight: 1.4 }}>
                    {item.text}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#aaa', flexShrink: 0, fontWeight: 600, marginTop: '0.1rem', whiteSpace: 'nowrap' }}>
                    {relativeTime(item.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Open RFIs panel */}
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden', alignSelf: 'start' }}>
          <div style={{ background: '#B91C1C', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🔴 Open RFIs
            </h2>
            <Link href="/manage/rfis" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', fontWeight: 700, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {panelRfis.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#aaa', fontSize: '0.875rem' }}>
              No open RFIs 🎉
            </div>
          ) : (
            <div>
              {panelRfis.map((rfi, i) => {
                const p = PRIORITY_COLORS[rfi.priority];
                const due = formatDueDate(rfi.dueDate);
                const dueRed = due === 'Today' || due.includes('overdue');
                return (
                  <Link
                    key={rfi.id}
                    href="/manage/rfis"
                    style={{
                      display: 'block', padding: '0.9rem 1.25rem',
                      borderBottom: i < panelRfis.length - 1 ? '1px solid #f0f0f0' : 'none',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={{
                        background: p.bg, color: p.color, border: `1.5px solid ${p.color}`,
                        borderRadius: 'var(--radius-pill)', padding: '0.1rem 0.55rem',
                        fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.5px',
                      }}>
                        {p.label}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 700 }}>#{rfi.number}</span>
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3, marginBottom: '0.25rem' }}>
                      {rfi.title}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888' }}>
                      <span>→ {rfi.assigneeName ?? 'Unassigned'}</span>
                      <span style={{ fontWeight: 700, color: dueRed ? '#B91C1C' : '#888' }}>
                        {rfi.dueDate ? `Due: ${due}` : 'No due date'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
            <Link href="/manage/rfis" style={{
              display: 'block', textAlign: 'center',
              background: 'var(--navy)', color: '#fff', border: 'var(--border)',
              borderRadius: 'var(--radius-pill)', padding: '0.5rem',
              fontSize: '0.8rem', fontWeight: 800, textDecoration: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}>
              + New RFI
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
