'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import type { FieldReportWithReporter, FieldReportType, FieldReportStatus, ListFieldReportsResponse, FieldReportResponse } from '@constractor/types';

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS = ['Tower A – Tel Aviv', 'Tower B – Tel Aviv', 'Riverside Complex', 'North Bridge', 'Mall Renovation'];
const LOCATIONS: Record<string, string[]> = {
  'Tower A – Tel Aviv':   ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Roof', 'Basement'],
  'Tower B – Tel Aviv':   ['Level 1', 'Level 2', 'Level 3', 'Roof'],
  'Riverside Complex':    ['Block A', 'Block B', 'Parking', 'Common Areas'],
  'North Bridge':         ['East Span', 'West Span', 'Pier 1', 'Pier 2'],
  'Mall Renovation':      ['Wing A', 'Wing B', 'Food Court', 'Parking Deck'],
};

const TYPE_META: Record<FieldReportType, { label: string; emoji: string; color: string; bg: string }> = {
  progress: { label: 'Progress', emoji: '✅', color: '#166534', bg: '#DCFCE7' },
  issue:    { label: 'Issue',    emoji: '⚠️', color: '#92400E', bg: '#FEF3C7' },
  delay:    { label: 'Delay',    emoji: '🕐', color: '#1E40AF', bg: '#DBEAFE' },
  safety:   { label: 'Safety',   emoji: '🔴', color: '#B91C1C', bg: '#FEE2E2' },
};

const STATUS_META: Record<FieldReportStatus, { label: string; color: string; bg: string }> = {
  open:         { label: 'Open',         color: '#B91C1C', bg: '#FEE2E2' },
  acknowledged: { label: 'Acknowledged', color: '#92400E', bg: '#FEF3C7' },
  resolved:     { label: 'Resolved',     color: '#166534', bg: '#DCFCE7' },
};

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isToday(d: Date | string): boolean {
  const date = new Date(d);
  const now = new Date();
  return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const token = () => getAccessToken() ?? '';

  const [reports, setReports] = useState<FieldReportWithReporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<FieldReportType>('progress');
  const [project, setProject] = useState(PROJECTS[0] ?? '');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [filterType, setFilterType] = useState<FieldReportType | 'all'>('all');
  const [selectedReport, setSelectedReport] = useState<FieldReportWithReporter | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const locationOptions = LOCATIONS[project] ?? [];

  const loadReports = useCallback(async () => {
    try {
      const data = await apiRequest<ListFieldReportsResponse>('/field-reports', { token: token() });
      setReports(data.reports);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadReports(); }, [loadReports]);

  async function handleSubmit() {
    if (!description.trim() || !location) return;
    setSubmitting(true);
    try {
      const data = await apiRequest<FieldReportResponse>('/field-reports', {
        method: 'POST',
        token: token(),
        body: { type: selectedType, project, location, description: description.trim() },
      });
      setReports((prev) => [data.report, ...prev]);
      setDescription('');
      setLocation('');
      setSelectedType('progress');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: FieldReportStatus) {
    setActionLoading(true);
    try {
      const data = await apiRequest<FieldReportResponse>(`/field-reports/${id}`, {
        method: 'PATCH',
        token: token(),
        body: { status },
      });
      setReports((prev) => prev.map((r) => r.id === id ? data.report : r));
      setSelectedReport((prev) => prev?.id === id ? data.report : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update report');
    } finally {
      setActionLoading(false);
    }
  }

  const filtered = filterType === 'all' ? reports : reports.filter((r) => r.type === filterType);
  const openCount = reports.filter((r) => r.status === 'open').length;
  const todayCount = reports.filter((r) => isToday(r.createdAt)).length;

  if (loading) return <div style={{ padding: '2rem', color: '#666' }}>Loading reports…</div>;
  if (pageError) return <div style={{ padding: '2rem', color: '#B91C1C' }}>{pageError}</div>;

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>Field Reports</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          {openCount} open · {todayCount} today
        </p>
      </div>

      {/* ── Create report form ─────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
      }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 900, color: 'var(--navy)' }}>
          📋 New Field Report
        </h2>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {(Object.entries(TYPE_META) as [FieldReportType, typeof TYPE_META[FieldReportType]][]).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setSelectedType(key)}
              style={{
                padding: '0.55rem 1.1rem', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                fontWeight: 800, fontSize: '0.875rem', border: 'var(--border)',
                background: selectedType === key ? meta.bg : '#fff',
                color: selectedType === key ? meta.color : '#888',
                boxShadow: selectedType === key ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.1s',
              }}
            >
              {meta.emoji} {meta.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label className="field-label">Project</label>
            <select className="comic-select" value={project} onChange={(e) => { setProject(e.target.value); setLocation(''); }}>
              {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Location</label>
            <select className="comic-select" value={location} onChange={(e) => setLocation(e.target.value)} required>
              <option value="">Select…</option>
              {locationOptions.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Description</label>
            <input
              className="comic-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what you observed…"
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            style={{
              background: '#f8f8f8', border: 'var(--border)', borderRadius: 'var(--radius-sm)',
              padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', color: '#555',
            }}
          >
            📷 Add Photo
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || !location || submitting}
            className="comic-btn-primary"
            style={{ width: 'auto', padding: '0.55rem 1.75rem', fontSize: '0.9rem' }}
          >
            {submitting ? <><span className="spinner" />Submitting…</> : '✓ Submit Report'}
          </button>
          {submitted && (
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '0.3rem 0.75rem', borderRadius: 'var(--radius-pill)', border: '1.5px solid #166534' }}>
              ✅ Report submitted!
            </span>
          )}
        </div>
      </div>

      {/* ── Report list + detail panel ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedReport ? '1fr 380px' : '1fr', gap: '1.25rem' }}>

        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
          {/* Filter bar */}
          <div style={{ background: 'var(--navy)', padding: '0.6rem 1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.25rem' }}>Filter</span>
            {(['all', 'progress', 'issue', 'delay', 'safety'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 700, border: '1.5px solid',
                  background: filterType === t ? '#fff' : 'transparent',
                  color: filterType === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)',
                  borderColor: filterType === t ? '#fff' : 'rgba(255,255,255,0.3)',
                }}
              >
                {t === 'all' ? 'All' : TYPE_META[t].emoji + ' ' + TYPE_META[t].label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '0.9rem' }}>
              No reports found
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f8f8', borderBottom: '2px solid var(--navy)' }}>
                  {['Type', 'Project', 'Location', 'Description', 'Reporter', 'Date', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const tm = TYPE_META[r.type];
                  const sm = STATUS_META[r.status];
                  const isSelected = selectedReport?.id === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedReport(isSelected ? null : r)}
                      style={{
                        background: isSelected ? '#FFF9E6' : i % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: '1px solid #eee', cursor: 'pointer',
                        borderLeft: isSelected ? '4px solid var(--orange)' : '4px solid transparent',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f5f5f5'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'; }}
                    >
                      <td style={{ padding: '0.7rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ background: tm.bg, color: tm.color, border: `1.5px solid ${tm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap', display: 'inline-block' }}>
                          {tm.emoji} {tm.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{r.project.split(' –')[0]}</td>
                      <td style={{ padding: '0.7rem 1rem', fontSize: '0.85rem', color: '#555', whiteSpace: 'nowrap' }}>{r.location}</td>
                      <td title={r.description} style={{ padding: '0.7rem 1rem', fontSize: '0.85rem', color: '#555', maxWidth: 0, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.photoBase64 && <span title="Has photo" style={{ marginRight: '0.35rem' }}>📷</span>}
                        {r.description}
                      </td>
                      <td style={{ padding: '0.7rem 1rem', fontSize: '0.82rem', color: '#666', whiteSpace: 'nowrap' }}>{r.reporterName}</td>
                      <td style={{ padding: '0.7rem 1rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy)' }}>{formatDate(r.createdAt)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.1rem' }}>{formatTime(r.createdAt)}</div>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ background: sm.bg, color: sm.color, border: `1.5px solid ${sm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap', display: 'inline-block' }}>
                          {sm.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selectedReport && (() => {
          const r = selectedReport;
          const tm = TYPE_META[r.type];
          const sm = STATUS_META[r.status];
          return (
            <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden', alignSelf: 'start' }}>
              <div style={{ background: 'var(--navy)', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>Report Detail</h3>
                <button onClick={() => setSelectedReport(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '1rem', fontWeight: 900 }}>✕</button>
              </div>
              <div style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ background: tm.bg, color: tm.color, border: `1.5px solid ${tm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 800 }}>
                    {tm.emoji} {tm.label}
                  </span>
                  <span style={{ background: sm.bg, color: sm.color, border: `1.5px solid ${sm.color}`, borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 800 }}>
                    {sm.label}
                  </span>
                </div>

                <div style={{ marginBottom: '0.6rem' }}>
                  <span className="field-label">Project</span>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--navy)' }}>{r.project}</p>
                </div>
                <div style={{ marginBottom: '0.6rem' }}>
                  <span className="field-label">Location</span>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: '#555' }}>{r.location}</p>
                </div>
                <div style={{ marginBottom: '0.6rem' }}>
                  <span className="field-label">Reported by</span>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: '#555' }}>{r.reporterName} · {formatDate(r.createdAt)}, {formatTime(r.createdAt)}</p>
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <span className="field-label">Description</span>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.875rem', color: 'var(--navy)', lineHeight: 1.5 }}>{r.description}</p>
                </div>

                {r.photoBase64 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <span className="field-label">Photo</span>
                    <img
                      src={`data:${r.photoMimeType ?? 'image/jpeg'};base64,${r.photoBase64}`}
                      alt="Field report photo"
                      style={{ display: 'block', width: '100%', marginTop: '0.4rem', borderRadius: 'var(--radius-sm)', border: 'var(--border)', objectFit: 'cover', maxHeight: '260px' }}
                    />
                  </div>
                )}

                {r.status !== 'resolved' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {r.status === 'open' && (
                      <button
                        onClick={() => updateStatus(r.id, 'acknowledged')}
                        disabled={actionLoading}
                        className="comic-btn-secondary"
                        style={{ padding: '0.5rem', fontSize: '0.875rem' }}
                      >
                        👁 Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(r.id, 'resolved')}
                      disabled={actionLoading}
                      className="comic-btn-primary"
                      style={{ padding: '0.5rem', fontSize: '0.875rem' }}
                    >
                      ✓ Mark Resolved
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
