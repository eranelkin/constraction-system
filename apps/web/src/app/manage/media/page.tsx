'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, getAccessToken } from '@/lib/auth/session';
import { apiRequest } from '@/lib/api-client';
import type { MediaFile } from '@constractor/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4501';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(storageKey: string): string {
  return storageKey.split('/').pop() ?? storageKey;
}

type Tab = 'videos' | 'audios';

export default function MediaFilesPage() {
  const router = useRouter();
  const token = () => getAccessToken() ?? '';

  const [files, setFiles] = useState<MediaFile[]>([]);
  const [tab, setTab] = useState<Tab>('videos');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== 'admin') {
      router.replace('/manage/dashboard');
      return;
    }
    void load();
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ files: MediaFile[] }>('/media/files', { token: token() });
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media files');
    } finally {
      setLoading(false);
    }
  }

  const visible = files.filter((f) =>
    tab === 'videos' ? f.mimeType.startsWith('video/') : f.mimeType.startsWith('audio/'),
  );

  const allSelected = visible.length > 0 && visible.every((f) => selected.has(f.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => {
        const next = new Set(s);
        visible.forEach((f) => next.delete(f.id));
        return next;
      });
    } else {
      setSelected((s) => {
        const next = new Set(s);
        visible.forEach((f) => next.add(f.id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function deleteIds(ids: string[]) {
    setDeleting(true);
    setError(null);
    try {
      await apiRequest<void>('/media/files', { method: 'DELETE', body: { ids }, token: token() });
      setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
      setSelected((s) => {
        const next = new Set(s);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function downloadSelected() {
    setDownloading(true);
    for (const id of selected) {
      const file = files.find((f) => f.id === id);
      if (!file) continue;
      const fullUrl = file.url.startsWith('/') ? `${API_URL}${file.url}` : file.url;
      try {
        const res = await fetch(fullUrl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName(file.storageKey);
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        // skip files that fail to download
      }
    }
    setDownloading(false);
  }

  const selectedCount = [...selected].filter((id) => visible.some((f) => f.id === id)).length;

  const tabStyle = (t: Tab) => ({
    padding: '0.4rem 1.2rem',
    borderRadius: 'var(--radius-pill)' as const,
    fontWeight: 700,
    fontSize: '0.9rem',
    cursor: 'pointer' as const,
    border: 'none',
    background: tab === t ? 'var(--orange)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--navy)',
    outline: tab === t ? 'var(--border)' : '2px solid transparent',
    transition: 'all 0.15s',
  });

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--navy)', margin: 0 }}>
          Media Files
        </h1>
        <p style={{ color: '#666', marginTop: '0.25rem', marginBottom: 0 }}>
          All uploaded audio and video files
        </p>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: '1rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', background: 'rgba(28,28,46,0.06)', padding: '0.25rem', borderRadius: 'var(--radius-pill)', width: 'fit-content' }}>
        <button style={tabStyle('videos')} onClick={() => setTab('videos')}>
          🎬 Videos ({files.filter((f) => f.mimeType.startsWith('video/')).length})
        </button>
        <button style={tabStyle('audios')} onClick={() => setTab('audios')}>
          🎵 Audios ({files.filter((f) => f.mimeType.startsWith('audio/')).length})
        </button>
      </div>

      {/* Selection toolbar */}
      {selectedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'var(--navy)', color: '#fff',
          padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)',
          marginBottom: '0.75rem',
          border: 'var(--border)', boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{selectedCount} selected</span>
          <button
            onClick={() => void deleteIds([...selected].filter((id) => visible.some((f) => f.id === id)))}
            disabled={deleting}
            style={{
              background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 8,
              padding: '0.3rem 0.8rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? 'Deleting…' : '🗑 Delete selected'}
          </button>
          <button
            onClick={() => void downloadSelected()}
            disabled={downloading}
            style={{
              background: '#38a169', color: '#fff', border: 'none', borderRadius: 8,
              padding: '0.3rem 0.8rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
              opacity: downloading ? 0.6 : 1,
            }}
          >
            {downloading ? 'Downloading…' : '⬇ Download selected'}
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#888' }}>
            <span className="spinner" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#888' }}>
            No {tab} yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--navy)', color: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ padding: '0.75rem 1rem', width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ accentColor: 'var(--orange)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '0.75rem 0.5rem', width: 36 }} />
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>
                  {tab === 'videos' ? 'Preview' : 'File'}
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Uploader</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Size</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '0.75rem 1rem', width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((file, i) => {
                const isSelected = selected.has(file.id);
                return (
                  <tr
                    key={file.id}
                    style={{
                      background: isSelected ? 'rgba(255,107,43,0.06)' : i % 2 === 0 ? '#fff' : '#fafafa',
                      borderBottom: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(file.id)}
                        style={{ accentColor: 'var(--orange)', width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
                      {file.mimeType.startsWith('video/') ? '🎬' : '🎵'}
                    </td>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      {file.mimeType.startsWith('video/') ? (
                        <video
                          src={file.url.startsWith('/') ? `${API_URL}${file.url}` : file.url}
                          controls
                          preload="metadata"
                          style={{ width: 160, height: 100, objectFit: 'cover', borderRadius: 6, display: 'block', border: '2px solid rgba(0,0,0,0.1)' }}
                        />
                      ) : (
                        <div>
                          <span style={{ color: 'var(--navy)', fontWeight: 600, fontSize: '0.8rem', display: 'block', marginBottom: 6, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fileName(file.storageKey)}
                          </span>
                          <audio
                            src={file.url.startsWith('/') ? `${API_URL}${file.url}` : file.url}
                            controls
                            preload="none"
                            style={{ width: 220, height: 32 }}
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', color: '#555' }}>{file.uploaderName}</td>
                    <td style={{ padding: '0.65rem 1rem', color: '#555' }}>
                      {file.sizeBytes != null ? formatBytes(file.sizeBytes) : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', color: '#555' }}>
                      <div>{new Date(file.createdAt).toLocaleDateString()}</div>
                      <div style={{ fontSize: '0.78rem', color: '#999', marginTop: 2 }}>
                        {new Date(file.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={() => void deleteIds([file.id])}
                        disabled={deleting}
                        title="Delete"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '1rem', opacity: deleting ? 0.4 : 0.6,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = deleting ? '0.4' : '0.6')}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && visible.length > 0 && (
        <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Showing {visible.length} {tab === 'videos' ? 'video' : 'audio'} file{visible.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
