'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser } from '@/lib/auth/session';
import type { GetJobResponse, HireContractorResponse, ApplyToJobResponse, JobDetail, AuthUser } from '@constractor/types';

const statusColors: Record<string, string> = {
  open: '#2563eb',
  assigned: '#d97706',
  completed: '#16a34a',
  cancelled: '#6b7280',
};

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [coverNote, setCoverNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  async function loadJob() {
    try {
      const token = getAccessToken() ?? '';
      const data = await apiRequest<GetJobResponse>(`/jobs/${jobId}`, { token });
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJob();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function handleApply(e: FormEvent) {
    e.preventDefault();
    if (!coverNote.trim()) return;
    setApplying(true);
    setError(null);
    try {
      const token = getAccessToken() ?? '';
      await apiRequest<ApplyToJobResponse>(`/jobs/${jobId}/apply`, {
        method: 'POST',
        token,
        body: { coverNote: coverNote.trim() },
      });
      setCoverNote('');
      await loadJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }

  async function handleHire(applicationId: string) {
    setError(null);
    try {
      const token = getAccessToken() ?? '';
      await apiRequest<HireContractorResponse>(`/jobs/${jobId}/hire/${applicationId}`, {
        method: 'POST',
        token,
      });
      await loadJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hire');
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Loading…</div>;
  }

  if (!job) {
    return <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#dc2626' }}>Job not found.</div>;
  }

  const myApp = user?.role === 'member' ? job.applications.at(0) : undefined;

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={() => router.push('/jobs')} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '1rem', color: '#3b82f6' }}>
          ← Jobs
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '1rem', cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
        </div>
      )}

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>{job.title}</h1>
          <span style={{
            padding: '0.25rem 0.625rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#fff',
            background: statusColors[job.status] ?? '#6b7280',
          }}>
            {job.status}
          </span>
        </div>
        <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{job.location}</div>
        <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: '1rem' }}>${job.budget.toLocaleString()}</div>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#1e293b', lineHeight: 1.6 }}>{job.description}</p>
      </div>

      {/* Contractor: apply or show status */}
      {user?.role === 'member' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          {myApp ? (
            <div>
              <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Your Application</div>
              <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.75rem' }}>{myApp.coverNote}</div>
              <span style={{
                padding: '0.25rem 0.625rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: myApp.status === 'accepted' ? '#dcfce7' : myApp.status === 'rejected' ? '#fee2e2' : '#fef9c3',
                color: myApp.status === 'accepted' ? '#15803d' : myApp.status === 'rejected' ? '#dc2626' : '#92400e',
              }}>
                {myApp.status.charAt(0).toUpperCase() + myApp.status.slice(1)}
              </span>
            </div>
          ) : job.status === 'open' ? (
            <form onSubmit={handleApply}>
              <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Apply to this job</div>
              <textarea
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                placeholder="Write a short cover note…"
                maxLength={1000}
                required
                rows={4}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', resize: 'vertical', boxSizing: 'border-box', marginBottom: '0.75rem' }}
              />
              <button
                type="submit"
                disabled={applying || !coverNote.trim()}
                style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                {applying ? 'Applying…' : 'Apply'}
              </button>
            </form>
          ) : (
            <p style={{ color: '#94a3b8', margin: 0 }}>This job is no longer accepting applications.</p>
          )}
        </div>
      )}

      {/* Client: list applications */}
      {user?.role === 'manager' && (
        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
            Applications ({job.applications.length})
          </h2>
          {job.applications.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>No applications yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {job.applications.map((app) => (
                <div key={app.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 500 }}>{app.contractorName}</div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: app.status === 'accepted' ? '#dcfce7' : app.status === 'rejected' ? '#fee2e2' : '#fef9c3',
                        color: app.status === 'accepted' ? '#15803d' : app.status === 'rejected' ? '#dc2626' : '#92400e',
                      }}>
                        {app.status}
                      </span>
                      {job.status === 'open' && app.status === 'pending' && (
                        <button
                          onClick={() => handleHire(app.id)}
                          style={{ padding: '0.25rem 0.625rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          Hire
                        </button>
                      )}
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>{app.coverNote}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
