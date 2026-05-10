'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser } from '@/lib/auth/session';
import type { CreateJobResponse } from '@constractor/types';

export default function NewJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'manager') {
      router.push('/jobs');
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!title.trim()) errors['title'] = 'Title is required.';
    else if (title.trim().length > 100) errors['title'] = 'Title must be 100 characters or fewer.';
    if (!description.trim()) errors['description'] = 'Description is required.';
    else if (description.trim().length > 2000) errors['description'] = 'Description must be 2000 characters or fewer.';
    const parsedBudget = parseFloat(budget);
    if (!budget || isNaN(parsedBudget) || parsedBudget <= 0) errors['budget'] = 'Enter a budget greater than 0.';
    if (!location.trim()) errors['location'] = 'Location is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setError(null);
    setSubmitting(true);
    try {
      const token = getAccessToken() ?? '';
      const data = await apiRequest<CreateJobResponse>('/jobs', {
        method: 'POST',
        token,
        body: { title, description, budget: parsedBudget, location },
      });
      router.push(`/jobs/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: '560px', margin: '2rem auto', padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={() => router.push('/jobs')} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '1rem', color: '#3b82f6' }}>
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Post a Job</h1>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Title</div>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); fieldErrors['title'] && setFieldErrors((p) => { const n = { ...p }; delete n['title']; return n; }); }}
            maxLength={100}
            required
            style={{ width: '100%', padding: '0.5rem', border: `1px solid ${fieldErrors['title'] ? '#e53e3e' : '#cbd5e1'}`, borderRadius: '6px', boxSizing: 'border-box' }}
          />
          {fieldErrors['title'] && <div style={{ color: '#e53e3e', fontSize: '0.78rem', marginTop: '0.25rem' }}>{fieldErrors['title']}</div>}
        </div>

        <div>
          <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Description</div>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); fieldErrors['description'] && setFieldErrors((p) => { const n = { ...p }; delete n['description']; return n; }); }}
            maxLength={2000}
            required
            rows={5}
            style={{ width: '100%', padding: '0.5rem', border: `1px solid ${fieldErrors['description'] ? '#e53e3e' : '#cbd5e1'}`, borderRadius: '6px', resize: 'vertical', boxSizing: 'border-box' }}
          />
          {fieldErrors['description'] && <div style={{ color: '#e53e3e', fontSize: '0.78rem', marginTop: '0.25rem' }}>{fieldErrors['description']}</div>}
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Budget ($)</div>
            <input
              type="number"
              value={budget}
              onChange={(e) => { setBudget(e.target.value); fieldErrors['budget'] && setFieldErrors((p) => { const n = { ...p }; delete n['budget']; return n; }); }}
              min={1}
              required
              style={{ width: '100%', padding: '0.5rem', border: `1px solid ${fieldErrors['budget'] ? '#e53e3e' : '#cbd5e1'}`, borderRadius: '6px', boxSizing: 'border-box' }}
            />
            {fieldErrors['budget'] && <div style={{ color: '#e53e3e', fontSize: '0.78rem', marginTop: '0.25rem' }}>{fieldErrors['budget']}</div>}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Location</div>
            <input
              value={location}
              onChange={(e) => { setLocation(e.target.value); fieldErrors['location'] && setFieldErrors((p) => { const n = { ...p }; delete n['location']; return n; }); }}
              required
              style={{ width: '100%', padding: '0.5rem', border: `1px solid ${fieldErrors['location'] ? '#e53e3e' : '#cbd5e1'}`, borderRadius: '6px', boxSizing: 'border-box' }}
            />
            {fieldErrors['location'] && <div style={{ color: '#e53e3e', fontSize: '0.78rem', marginTop: '0.25rem' }}>{fieldErrors['location']}</div>}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{ padding: '0.625rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}
        >
          {submitting ? 'Posting…' : 'Post Job'}
        </button>
      </form>
    </div>
  );
}
