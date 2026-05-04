'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import type { ScheduleTaskWithCreator, ScheduleTaskStatus, ListScheduleTasksResponse, ScheduleTaskResponse } from '@constractor/types';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<ScheduleTaskStatus, { label: string; color: string; bg: string; emoji: string }> = {
  'on-track': { label: 'On Track', color: '#166534', bg: '#DCFCE7', emoji: '🟢' },
  'delayed':  { label: 'Delayed',  color: '#92400E', bg: '#FEF3C7', emoji: '🟡' },
  'critical': { label: 'Critical', color: '#B91C1C', bg: '#FEE2E2', emoji: '🔴' },
  'complete': { label: 'Complete', color: '#1E40AF', bg: '#DBEAFE', emoji: '✅' },
};

type Filter = 'all' | ScheduleTaskStatus;

const PROJECTS = ['Tower A – Tel Aviv', 'Tower B – Tel Aviv', 'Riverside Complex', 'North Bridge', 'Mall Renovation'];

function formatPlannedDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const router = useRouter();
  const token = () => getAccessToken() ?? '';

  const [tasks, setTasks] = useState<ScheduleTaskWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ScheduleTaskWithCreator | null>(null);
  const [showLogDelay, setShowLogDelay] = useState(false);
  const [notified, setNotified] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [dlTask, setDlTask] = useState('');
  const [dlProject, setDlProject] = useState('Tower A – Tel Aviv');
  const [dlPlanned, setDlPlanned] = useState('');
  const [dlDays, setDlDays] = useState('');
  const [dlReason, setDlReason] = useState('');
  const [dlSubmitting, setDlSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const data = await apiRequest<ListScheduleTasksResponse>('/schedule-tasks', { token: token() });
      setTasks(data.tasks);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  async function updateTask(id: string, body: { status?: ScheduleTaskStatus }) {
    setActionLoading(true);
    try {
      const data = await apiRequest<ScheduleTaskResponse>(`/schedule-tasks/${id}`, {
        method: 'PATCH',
        token: token(),
        body,
      });
      setTasks((prev) => prev.map((t) => t.id === id ? data.task : t));
      setSelected((prev) => prev?.id === id ? data.task : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setActionLoading(false);
    }
  }

  async function submitLogDelay() {
    if (!dlTask.trim() || !dlDays || !dlPlanned) return;
    setDlSubmitting(true);
    try {
      const data = await apiRequest<ScheduleTaskResponse>('/schedule-tasks', {
        method: 'POST',
        token: token(),
        body: {
          taskName: dlTask.trim(),
          project: dlProject,
          plannedDate: dlPlanned,
          delayDays: parseInt(dlDays, 10),
          ...(dlReason.trim() ? { reason: dlReason.trim() } : {}),
        },
      });
      setTasks((prev) => [data.task, ...prev]);
      setDlTask(''); setDlDays(''); setDlPlanned(''); setDlReason('');
      setShowLogDelay(false);
      setSelected(data.task);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to log delay');
    } finally {
      setDlSubmitting(false);
    }
  }

  function notifyTeam(id: string) {
    setNotified(id);
    setTimeout(() => setNotified(null), 3000);
  }

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
  const criticalCount  = tasks.filter((t) => t.status === 'critical').length;
  const delayedCount   = tasks.filter((t) => t.status === 'delayed').length;
  const onTrackCount   = tasks.filter((t) => t.status === 'on-track').length;
  const completedCount = tasks.filter((t) => t.status === 'complete').length;

  if (loading) return <div style={{ padding: '2rem', color: '#666' }}>Loading schedule…</div>;
  if (pageError) return <div style={{ padding: '2rem', color: '#B91C1C' }}>{pageError}</div>;

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>Schedule & Delays</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
            {criticalCount} critical · {delayedCount} delayed · {onTrackCount} on track · {completedCount} complete
          </p>
        </div>
        <button
          onClick={() => setShowLogDelay((v) => !v)}
          className="comic-btn-primary"
          style={{ width: 'auto', padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
        >
          + Log Delay
        </button>
      </div>

      {/* Log delay form */}
      {showLogDelay && (
        <div style={{ background: '#fff', border: '2.5px solid var(--orange)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 900, color: 'var(--navy)' }}>🕐 Log a Delay</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label className="field-label">Task Name</label>
              <input className="comic-input" value={dlTask} onChange={(e) => setDlTask(e.target.value)} placeholder="e.g. Steel frame delivery" style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }} />
            </div>
            <div>
              <label className="field-label">Project</label>
              <select className="comic-select" value={dlProject} onChange={(e) => setDlProject(e.target.value)} style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }}>
                {PROJECTS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Planned Date</label>
              <input className="comic-input" type="date" value={dlPlanned} onChange={(e) => setDlPlanned(e.target.value)} style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }} />
            </div>
            <div>
              <label className="field-label">Delay (days)</label>
              <input className="comic-input" type="number" min="1" value={dlDays} onChange={(e) => setDlDays(e.target.value)} placeholder="e.g. 3" style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }} />
            </div>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label className="field-label">Reason (optional)</label>
            <input className="comic-input" value={dlReason} onChange={(e) => setDlReason(e.target.value)} placeholder="Briefly describe the cause of the delay…" style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={submitLogDelay} disabled={!dlTask.trim() || !dlDays || !dlPlanned || dlSubmitting} className="comic-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}>
              {dlSubmitting ? <><span className="spinner" />Logging…</> : '✓ Log Delay'}
            </button>
            <button onClick={() => setShowLogDelay(false)} className="comic-btn-secondary" style={{ width: 'auto', padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main area */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: '1.25rem' }}>

        {/* Table */}
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--navy)', padding: '0.6rem 1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.25rem' }}>Filter</span>
            {(['all', 'critical', 'delayed', 'on-track', 'complete'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 700, border: '1.5px solid',
                  background: filter === f ? '#fff' : 'transparent',
                  color: filter === f ? 'var(--navy)' : 'rgba(255,255,255,0.7)',
                  borderColor: filter === f ? '#fff' : 'rgba(255,255,255,0.3)',
                }}
              >
                {f === 'all' ? 'All' : STATUS_META[f].emoji + ' ' + STATUS_META[f].label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '0.9rem' }}>No tasks found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f8f8', borderBottom: '2px solid var(--navy)' }}>
                  {['Task', 'Project', 'Planned', 'Delay', 'Status', 'Logged by'].map((h) => (
                    <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const sm = STATUS_META[t.status];
                  const isSelected = selected?.id === t.id;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(isSelected ? null : t)}
                      style={{
                        background: isSelected ? '#FFF9E6' : i % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: '1px solid #eee', cursor: 'pointer',
                        borderLeft: isSelected ? '4px solid var(--orange)' : '4px solid transparent',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f5f5f5'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'; }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy)' }}>{t.taskName}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#555' }}>{t.project.split(' –')[0]}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#666', whiteSpace: 'nowrap' }}>{formatPlannedDate(t.plannedDate)}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 800, color: t.delayDays > 0 ? (t.delayDays >= 5 ? '#B91C1C' : '#92400E') : '#166534' }}>
                        {t.delayDays > 0 ? `+${t.delayDays}d` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ background: sm.bg, color: sm.color, border: `1.5px solid ${sm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.15rem 0.65rem', fontSize: '0.72rem', fontWeight: 800 }}>
                          {sm.emoji} {sm.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#666' }}>{t.creatorName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail drawer */}
        {selected && (() => {
          const t = selected;
          const sm = STATUS_META[t.status];
          return (
            <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden', alignSelf: 'start' }}>
              <div style={{ background: 'var(--navy)', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>Task Detail</h3>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '1rem', fontWeight: 900 }}>✕</button>
              </div>
              <div style={{ padding: '1.25rem' }}>
                <span style={{ background: sm.bg, color: sm.color, border: `1.5px solid ${sm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 800, display: 'inline-block', marginBottom: '0.875rem' }}>
                  {sm.emoji} {sm.label}
                </span>

                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 900, color: 'var(--navy)' }}>{t.taskName}</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#888' }}>Project</span>
                    <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{t.project.split(' –')[0]}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#888' }}>Planned date</span>
                    <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{formatPlannedDate(t.plannedDate)}</span>
                  </div>
                  {t.delayDays > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: '#888' }}>Delay</span>
                      <span style={{ fontWeight: 800, color: t.delayDays >= 5 ? '#B91C1C' : '#92400E' }}>+{t.delayDays} days</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#888' }}>Logged by</span>
                    <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{t.creatorName}</span>
                  </div>
                </div>

                {t.reason && (
                  <div style={{ background: '#FFF9E6', border: '1.5px solid var(--yellow)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', marginBottom: '0.875rem' }}>
                    <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#92400E' }}>Delay Reason</p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--navy)', lineHeight: 1.45 }}>{t.reason}</p>
                  </div>
                )}

                {t.impact && (
                  <div style={{ background: '#FEE2E2', border: '1.5px solid #B91C1C', borderRadius: 'var(--radius-sm)', padding: '0.75rem', marginBottom: '1.1rem' }}>
                    <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#B91C1C' }}>Schedule Impact</p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--navy)', lineHeight: 1.45 }}>{t.impact}</p>
                  </div>
                )}

                {t.status !== 'complete' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {t.status === 'critical' && (
                      <button onClick={() => updateTask(t.id, { status: 'delayed' })} disabled={actionLoading} className="comic-btn-secondary" style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
                        👁 Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => router.push('/manage/rfis')}
                      className="comic-btn-secondary"
                      style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                    >
                      📄 Create RFI
                    </button>
                    <button
                      onClick={() => notifyTeam(t.id)}
                      className="comic-btn-primary"
                      style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                    >
                      {notified === t.id ? '✅ Team Notified!' : '📣 Notify Team'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
