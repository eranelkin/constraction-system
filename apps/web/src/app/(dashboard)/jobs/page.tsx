'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser } from '@/lib/auth/session';
import type { ListJobsResponse, JobSummary, AuthUser } from '@constractor/types';

export default function JobsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const token = getAccessToken() ?? '';
        const data = await apiRequest<ListJobsResponse>('/jobs', { token });
        setJobs(data.jobs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Job Board</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Messages
          </button>
          <button onClick={() => router.push('/my-jobs')} style={{ padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            My Jobs
          </button>
          {user?.role === 'manager' && (
            <button
              onClick={() => router.push('/jobs/new')}
              style={{ padding: '0.375rem 0.75rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px' }}
            >
              Post a Job
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading...</p>
      ) : jobs.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No open jobs yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => router.push(`/jobs/${job.id}`)}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{job.title}</div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>{job.location}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: '#16a34a' }}>${job.budget.toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    {job.applicationCount} application{job.applicationCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
