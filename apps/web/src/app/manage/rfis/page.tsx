'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import type { RfiWithUsers, RfiPriority, RfiStatus, ListRfisResponse, RfiResponse } from '@constractor/types';
import type { ListUsersResponse, PublicUser } from '@constractor/types';

// ── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_META: Record<RfiPriority, { label: string; color: string; bg: string }> = {
  critical: { label: 'CRITICAL', color: '#B91C1C', bg: '#FEE2E2' },
  high:     { label: 'HIGH',     color: '#92400E', bg: '#FEF3C7' },
  medium:   { label: 'MED',      color: '#1E40AF', bg: '#DBEAFE' },
  low:      { label: 'LOW',      color: '#166534', bg: '#DCFCE7' },
};

const STATUS_META: Record<RfiStatus, { label: string; color: string; bg: string }> = {
  'open':      { label: 'Open',      color: '#B91C1C', bg: '#FEE2E2' },
  'in-review': { label: 'In Review', color: '#92400E', bg: '#FEF3C7' },
  'answered':  { label: 'Answered',  color: '#166534', bg: '#DCFCE7' },
  'closed':    { label: 'Closed',    color: '#555',    bg: '#f0f0f0' },
};

const PROJECTS = ['Tower A – Tel Aviv', 'Tower B – Tel Aviv', 'Riverside Complex', 'North Bridge', 'Mall Renovation'];
const PRIORITIES: RfiPriority[] = ['low', 'medium', 'high', 'critical'];

type StatusFilter = RfiStatus | 'all';

function formatDate(d: Date | string): string {
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso + 'T00:00:00');
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0)  return `${Math.abs(diffDays)}d overdue`;
  return `+${diffDays} days`;
}

function isDueToday(iso: string | null): boolean {
  if (!iso) return false;
  const date = new Date(iso + 'T00:00:00');
  const now = new Date();
  return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RFIsPage() {
  const token = () => getAccessToken() ?? '';

  const [rfis, setRfis]   = useState<RfiWithUsers[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [selected, setSelected]     = useState<RfiWithUsers | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter]         = useState<StatusFilter>('all');
  const [response, setResponse]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Create form state
  const [fTitle, setFTitle]       = useState('');
  const [fDesc, setFDesc]         = useState('');
  const [fProject, setFProject]   = useState(PROJECTS[0] ?? '');
  const [fPriority, setFPriority] = useState<RfiPriority>('medium');
  const [fAssignee, setFAssignee] = useState('');
  const [fDue, setFDue]           = useState('');
  const [creating, setCreating]   = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [rfiData, userData] = await Promise.all([
        apiRequest<ListRfisResponse>('/rfis', { token: token() }),
        apiRequest<ListUsersResponse>('/users', { token: token() }),
      ]);
      setRfis(rfiData.rfis);
      setUsers(userData.users.filter((u) => u.isActive));
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load RFIs');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadData(); }, [loadData]);

  async function submitCreate() {
    if (!fTitle.trim() || !fDesc.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        title: fTitle.trim(),
        description: fDesc.trim(),
        project: fProject,
        priority: fPriority,
      };
      if (fAssignee) body['assignedTo'] = fAssignee;
      if (fDue)      body['dueDate']    = fDue;

      const data = await apiRequest<RfiResponse>('/rfis', { method: 'POST', token: token(), body });
      setRfis((prev) => [data.rfi, ...prev]);
      setFTitle(''); setFDesc(''); setFPriority('medium'); setFAssignee(''); setFDue('');
      setShowCreate(false);
      setSelected(data.rfi);
      setFilter('all');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create RFI');
    } finally {
      setCreating(false);
    }
  }

  async function patchRfi(id: string, body: Record<string, unknown>) {
    setActionLoading(true);
    try {
      const data = await apiRequest<RfiResponse>(`/rfis/${id}`, { method: 'PATCH', token: token(), body });
      setRfis((prev) => prev.map((r) => r.id === id ? data.rfi : r));
      setSelected((prev) => prev?.id === id ? data.rfi : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update RFI');
    } finally {
      setActionLoading(false);
    }
  }

  function markAnswered() {
    if (!selected || !response.trim()) return;
    void patchRfi(selected.id, { status: 'answered', response: response.trim() });
    setResponse('');
  }

  function escalate() {
    if (!selected) return;
    const newPriority: RfiPriority =
      selected.priority === 'low' ? 'medium' : selected.priority === 'medium' ? 'high' : 'critical';
    void patchRfi(selected.id, { priority: newPriority });
  }

  const filtered = filter === 'all' ? rfis : rfis.filter((r) => r.status === filter);
  const openCount     = rfis.filter((r) => r.status === 'open').length;
  const inReviewCount = rfis.filter((r) => r.status === 'in-review').length;
  const answeredCount = rfis.filter((r) => r.status === 'answered').length;
  const closedCount   = rfis.filter((r) => r.status === 'closed').length;

  if (loading) return <div style={{ padding: '2rem', color: '#666' }}>Loading RFIs…</div>;
  if (pageError) return <div style={{ padding: '2rem', color: '#B91C1C' }}>{pageError}</div>;

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>RFIs</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
            {openCount} open · {inReviewCount} in review · {answeredCount} answered · {closedCount} closed
          </p>
        </div>
        <button
          onClick={() => { setShowCreate((v) => !v); setSelected(null); }}
          className="comic-btn-primary"
          style={{ width: 'auto', padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
        >
          + New RFI
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: '#fff', border: '2.5px solid var(--orange)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 900, color: 'var(--navy)' }}>📄 New RFI</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label className="field-label">Title</label>
              <input className="comic-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Briefly state what information is needed" style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }} />
            </div>
            <div>
              <label className="field-label">Project</label>
              <select className="comic-select" value={fProject} onChange={(e) => setFProject(e.target.value)} style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }}>
                {PROJECTS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label className="field-label">Description</label>
            <textarea
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              placeholder="Provide full context — reference drawing numbers, spec sections, and exactly what clarification is needed…"
              rows={3}
              style={{ width: '100%', padding: '0.625rem 0.875rem', fontSize: '0.9rem', fontFamily: 'inherit', background: 'var(--cream)', border: 'var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical', color: 'var(--navy)' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label className="field-label">Priority</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {PRIORITIES.map((p) => {
                  const pm = PRIORITY_META[p];
                  return (
                    <button
                      key={p}
                      onClick={() => setFPriority(p)}
                      style={{
                        padding: '0.3rem 0.7rem', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                        fontWeight: 800, fontSize: '0.75rem', border: `1.5px solid ${pm.color}`,
                        background: fPriority === p ? pm.bg : '#fff',
                        color: pm.color,
                        boxShadow: fPriority === p ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      {pm.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="field-label">Assign to</label>
              <select className="comic-select" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input className="comic-input" type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} style={{ padding: '0.5rem 0.875rem', fontSize: '0.9rem' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={submitCreate} disabled={!fTitle.trim() || !fDesc.trim() || creating} className="comic-btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}>
              {creating ? <><span className="spinner" />Creating…</> : '✓ Submit RFI'}
            </button>
            <button onClick={() => setShowCreate(false)} className="comic-btn-secondary" style={{ width: 'auto', padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap: '1.25rem' }}>

        {/* RFI list */}
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--navy)', padding: '0.6rem 1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.25rem' }}>Filter</span>
            {(['all', 'open', 'in-review', 'answered', 'closed'] as StatusFilter[]).map((f) => (
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
                {f === 'all' ? `All (${rfis.length})` : STATUS_META[f].label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '0.9rem' }}>No RFIs found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f8f8', borderBottom: '2px solid var(--navy)' }}>
                  {['#', 'Title', 'Project', 'Priority', 'Status', 'Assigned', 'Due'].map((h) => (
                    <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const pm = PRIORITY_META[r.priority];
                  const sm = STATUS_META[r.status];
                  const isSelected = selected?.id === r.id;
                  const overdue = isDueToday(r.dueDate) && r.status !== 'answered' && r.status !== 'closed';
                  return (
                    <tr
                      key={r.id}
                      onClick={() => { setSelected(isSelected ? null : r); setResponse(''); }}
                      style={{
                        background: isSelected ? '#FFF9E6' : i % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: '1px solid #eee', cursor: 'pointer',
                        borderLeft: isSelected ? '4px solid var(--orange)' : '4px solid transparent',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f5f5f5'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'; }}
                    >
                      <td style={{ padding: '0.7rem 1rem', fontSize: '0.8rem', fontWeight: 800, color: '#aaa' }}>#{r.number}</td>
                      <td style={{ padding: '0.7rem 1rem', fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy)', maxWidth: 260 }}>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.title}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', fontSize: '0.82rem', color: '#666', whiteSpace: 'nowrap' }}>{r.project ? r.project.split(' –')[0] : '—'}</td>
                      <td style={{ padding: '0.7rem 1rem' }}>
                        <span style={{ background: pm.bg, color: pm.color, border: `1.5px solid ${pm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.12rem 0.55rem', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.3px' }}>
                          {pm.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 1rem' }}>
                        <span style={{ background: sm.bg, color: sm.color, border: `1.5px solid ${sm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.12rem 0.55rem', fontSize: '0.68rem', fontWeight: 800 }}>
                          {sm.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', fontSize: '0.82rem', color: '#666', whiteSpace: 'nowrap' }}>{r.assigneeName ?? '—'}</td>
                      <td style={{ padding: '0.7rem 1rem', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', color: overdue ? '#B91C1C' : '#666' }}>
                        {formatDueDate(r.dueDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (() => {
          const r = selected;
          const pm = PRIORITY_META[r.priority];
          const sm = STATUS_META[r.status];
          const canRespond = r.status === 'open' || r.status === 'in-review';
          return (
            <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden', alignSelf: 'start' }}>
              <div style={{ background: 'var(--navy)', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>RFI #{r.number}</h3>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '1rem', fontWeight: 900 }}>✕</button>
              </div>

              <div style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                  <span style={{ background: pm.bg, color: pm.color, border: `1.5px solid ${pm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 800 }}>
                    {pm.label}
                  </span>
                  <span style={{ background: sm.bg, color: sm.color, border: `1.5px solid ${sm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 800 }}>
                    {sm.label}
                  </span>
                </div>

                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 900, color: 'var(--navy)', lineHeight: 1.35 }}>{r.title}</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {[
                    ['Project',    r.project ?? '—'],
                    ['Created by', r.creatorName],
                    ['Assigned to', r.assigneeName ?? 'Unassigned'],
                    ['Due',        formatDueDate(r.dueDate)],
                    ['Submitted',  formatDate(r.createdAt)],
                    ...(r.resolvedAt ? [['Resolved', formatDate(r.resolvedAt)]] : []),
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>{label}</span>
                      <span style={{ fontWeight: 700, color: 'var(--navy)', textAlign: 'right', maxWidth: '55%' }}>{val}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#f8f8f8', border: '1.5px solid #e0e0e0', borderRadius: 'var(--radius-sm)', padding: '0.875rem', marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888' }}>Question</p>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--navy)', lineHeight: 1.5 }}>{r.description}</p>
                </div>

                {r.response && (
                  <div style={{ background: '#DCFCE7', border: '1.5px solid #166534', borderRadius: 'var(--radius-sm)', padding: '0.875rem', marginBottom: '1rem' }}>
                    <p style={{ margin: '0 0 0.2rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#166534' }}>Response</p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--navy)', lineHeight: 1.5 }}>{r.response}</p>
                  </div>
                )}

                {r.status !== 'closed' && (
                  <>
                    {canRespond && (
                      <>
                        <label className="field-label" style={{ marginBottom: '0.4rem', display: 'block' }}>Response</label>
                        <textarea
                          value={response}
                          onChange={(e) => setResponse(e.target.value)}
                          placeholder="Write your answer or clarification here…"
                          rows={3}
                          style={{ width: '100%', padding: '0.625rem 0.875rem', fontSize: '0.875rem', fontFamily: 'inherit', background: 'var(--cream)', border: 'var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical', color: 'var(--navy)', marginBottom: '0.75rem' }}
                        />
                      </>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {r.status === 'open' && (
                        <button onClick={() => patchRfi(r.id, { status: 'in-review' })} disabled={actionLoading} className="comic-btn-secondary" style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
                          👁 Mark In Review
                        </button>
                      )}
                      {canRespond && (
                        <button
                          onClick={markAnswered}
                          disabled={!response.trim() || actionLoading}
                          className="comic-btn-primary"
                          style={{ padding: '0.5rem', fontSize: '0.85rem', opacity: response.trim() ? 1 : 0.5 }}
                        >
                          ✓ Mark as Answered
                        </button>
                      )}
                      {r.priority !== 'critical' && (
                        <button onClick={escalate} disabled={actionLoading} style={{ padding: '0.45rem', fontSize: '0.85rem', fontWeight: 700, background: '#FEE2E2', color: '#B91C1C', border: '1.5px solid #B91C1C', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}>
                          ⬆ Escalate Priority
                        </button>
                      )}
                      <button onClick={() => patchRfi(r.id, { status: 'closed' })} disabled={actionLoading} style={{ padding: '0.45rem', fontSize: '0.85rem', fontWeight: 700, background: '#f0f0f0', color: '#555', border: '1.5px solid #ccc', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}>
                        ✕ Close RFI
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
