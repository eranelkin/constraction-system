'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser } from '@/lib/auth/session';
import type { PlatformSettings } from '@constractor/types';

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [videoDuration, setVideoDuration] = useState(12);
  const [videoQuality, setVideoQuality] = useState(0.4);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = () => getAccessToken() ?? '';

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'admin') {
      router.replace('/manage/dashboard');
      return;
    }

    void apiRequest<PlatformSettings>('/settings', { token: token() }).then((data) => {
      setSettings(data);
      setVideoDuration(data.videoMaxDurationSeconds);
      setVideoQuality(data.videoQuality);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiRequest<PlatformSettings>('/settings', {
        method: 'PATCH',
        body: { videoMaxDurationSeconds: videoDuration, videoQuality },
        token: token(),
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#999' }}>
        <span className="spinner" style={{ display: 'inline-block', marginRight: '0.5rem' }} />
        Loading settings…
      </div>
    );
  }

  const qualityOptions = [
    { value: 0.2, label: '🔋 Low (0.2) — smallest file' },
    { value: 0.4, label: '⚖️ Medium (0.4) — balanced' },
    { value: 0.6, label: '🎯 High (0.6) — best quality' },
  ];

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>⚙️ Platform Settings</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          Configure platform-wide defaults for media and permissions.
        </p>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: '1rem' }}>⚠️ {error}</div>}

      <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '2rem', maxWidth: '560px' }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy)' }}>📹 Video Settings</h2>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="field-label">Max Recording Duration</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
              <input
                type="range"
                min={5}
                max={60}
                step={1}
                value={videoDuration}
                onChange={(e) => setVideoDuration(parseInt(e.target.value, 10))}
                style={{ flex: 1 }}
              />
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--navy)', minWidth: '60px', textAlign: 'right' }}>
                {videoDuration}s
              </span>
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#888' }}>
              Range: 5 – 60 seconds. Currently {videoDuration === settings.videoMaxDurationSeconds ? 'saved' : 'unsaved'}.
            </p>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label className="field-label">Video Quality</label>
            <select
              className="comic-select"
              value={videoQuality}
              onChange={(e) => setVideoQuality(parseFloat(e.target.value))}
              style={{ marginTop: '0.5rem' }}
            >
              {qualityOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#888' }}>
              Higher quality means larger file sizes. Medium is recommended for most sites.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button type="submit" className="comic-btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" />Saving…</> : '✓ Save Settings'}
            </button>
            {saved && (
              <span style={{ color: '#38a169', fontWeight: 700, fontSize: '0.9rem' }}>
                ✓ Saved!
              </span>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
