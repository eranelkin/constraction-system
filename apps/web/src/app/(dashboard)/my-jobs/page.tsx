'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser } from '@/lib/auth/session';
import type { MyJobsResponse, MyApplicationsResponse, JobSummary, AuthUser } from '@constractor/types';

const jobStatusColors: Record<string, { bg: string; text: string }> = {
  open:      { bg: '#dbeafe', text: '#1d4ed8' },
  assigned:  { bg: '#fef3c7', text: '#92400e' },
  completed: { bg: '#dcfce7', text: '#15803d' },
  cancelled: { bg: '#f1f5f9', text: '#6b7280' },
};

const appStatusColors: Record<string, { bg: string; text: string }> = {
  pending:  { bg: '#fef9c3', text: '#92400e' },
  accepted: { bg: '#dcfce7', text: '#15803d' },
  rejected: { bg: '#fee2e2', text: '#dc2626' },
};

export default function MyJobsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [applications, setApplications] = useState<MyApplicationsResponse['applications']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = getAccessToken() ?? '';
        if (user!.role === 'manager') {
          const data = await apiRequest<MyJobsResponse>('/my/jobs', { token });
          setJobs(data.jobs);
        } else {
          const data = await apiRequest<MyApplicationsResponse>('/my/applications', { token });
          setApplications(data.applications);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{user?.role === 'manager' ? 'My Jobs' : 'My Applications'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Messages
          </button>
          <button onClick={() => router.push('/jobs')} style={{ padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Job Board
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading…</p>
      ) : user?.role === 'manager' ? (
        jobs.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>You haven't posted any jobs yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {jobs.map((job) => {
              const colors = jobStatusColors[job.status] ?? { bg: '#f1f5f9', text: '#6b7280' };
              return (
                <div
                  key={job.id}
                  onClick={() => router.push(`/jobs/${job.id}`)}
                  style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', cursor: 'pointer', background: '#fff' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{job.title}</div>
                      <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>{job.location}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, background: colors.bg, color: colors.text }}>
                        {job.status}
                      </span>
                      <span style={{ fontWeight: 600, color: '#16a34a', fontSize: '0.9rem' }}>${job.budget.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        applications.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>You haven't applied to any jobs yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {applications.map((app) => {
              const appColors = appStatusColors[app.status] ?? { bg: '#f1f5f9', text: '#6b7280' };
              const jobColors = jobStatusColors[app.jobStatus] ?? { bg: '#f1f5f9', text: '#6b7280' };
              return (
                <div
                  key={app.id}
                  onClick={() => router.push(`/jobs/${app.jobId}`)}
                  style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', cursor: 'pointer', background: '#fff' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{app.jobTitle}</div>
                      <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {app.coverNote}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, background: appColors.bg, color: appColors.text }}>
                        {app.status}
                      </span>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, background: jobColors.bg, color: jobColors.text }}>
                        job: {app.jobStatus}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
