'use client';

import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser } from '@/lib/auth/session';
import type { ListUsersResponse, CreateUserRequest, UpdateUserRequest, UserResponse, PublicUser } from '@constractor/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4501';

const ROLE_OPTIONS = [
  { value: 'admin',   label: '🛡️ Admin' },
  { value: 'manager', label: '💼 Manager' },
  { value: 'member',  label: '👷 Member' },
];

const LANGUAGES = [
  { code: 'en', label: '🇺🇸 English' },
  { code: 'he', label: '🇮🇱 Hebrew' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'ru', label: '🇷🇺 Russian' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'pt', label: '🇧🇷 Portuguese' },
  { code: 'ro', label: '🇷🇴 Romanian' },
  { code: 'tr', label: '🇹🇷 Turkish' },
  { code: 'zh', label: '🇨🇳 Chinese' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'am', label: '🇪🇹 Amharic' },
  { code: 'tl', label: '🇵🇭 Filipino' },
];

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  admin:   { bg: 'var(--navy)',   color: '#fff' },
  manager: { bg: 'var(--orange)', color: '#fff' },
  member:  { bg: 'var(--yellow)', color: 'var(--navy)' },
};

const MAX_AVATAR_MB = 2;

type FormMode = 'add' | 'edit';

interface UserFormData {
  displayName: string;
  email: string;
  password: string;
  role: string;
  language: string;
  avatarFile: File | null;
  deleteAvatar: boolean;
}

const EMPTY_FORM: UserFormData = {
  displayName: '', email: '', password: '', role: 'member', language: 'en',
  avatarFile: null, deleteAvatar: false,
};

function avatarUrl(userId: string, bust: number) {
  return `${API_URL}/users/${userId}/avatar?t=${bust}`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editTarget, setEditTarget] = useState<PublicUser | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  // cache-bust counter per user id
  const [avatarBust, setAvatarBust] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin';
  const token = () => getAccessToken() ?? '';

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiRequest<ListUsersResponse>('/users', { token: token() });
      setUsers(data.users);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  function openAdd() {
    setFormMode('add');
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setAvatarPreview(null);
    setFormError(null);
  }

  function openEdit(user: PublicUser) {
    setFormMode('edit');
    setEditTarget(user);
    setForm({ displayName: user.displayName, email: user.email, password: '', role: user.role, language: user.language, avatarFile: null, deleteAvatar: false });
    setAvatarPreview(null);
    setFormError(null);
  }

  function closeForm() {
    setFormMode(null);
    setEditTarget(null);
    setAvatarPreview(null);
    setFormError(null);
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setFormError(`Image must be under ${MAX_AVATAR_MB} MB`);
      return;
    }
    setForm((f) => ({ ...f, avatarFile: file, deleteAvatar: false }));
    setAvatarPreview(URL.createObjectURL(file));
    setFormError(null);
  }

  function removeAvatarSelection() {
    setForm((f) => ({ ...f, avatarFile: null }));
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function markDeleteAvatar() {
    setForm((f) => ({ ...f, deleteAvatar: true, avatarFile: null }));
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      if (formMode === 'add') {
        const body: CreateUserRequest = {
          displayName: form.displayName,
          email: form.email,
          password: form.password,
          role: form.role as CreateUserRequest['role'],
          language: form.language,
        };
        if (form.avatarFile) {
          body.avatar = await fileToBase64(form.avatarFile);
          body.avatarMimeType = form.avatarFile.type;
        }
        await apiRequest<UserResponse>('/users', { method: 'POST', body, token: token() });

      } else if (formMode === 'edit' && editTarget) {
        const body: UpdateUserRequest = {
          displayName: form.displayName,
          email: form.email,
          language: form.language,
        };
        if (form.role) body.role = form.role as NonNullable<UpdateUserRequest['role']>;
        if (form.password) body.password = form.password;
        if (form.deleteAvatar) {
          body.avatar = null;
        } else if (form.avatarFile) {
          body.avatar = await fileToBase64(form.avatarFile);
          body.avatarMimeType = form.avatarFile.type;
        }
        await apiRequest<UserResponse>(`/users/${editTarget.id}`, { method: 'PATCH', body, token: token() });
        // bump cache-bust so the img tag reloads
        setAvatarBust((prev) => ({ ...prev, [editTarget.id]: Date.now() }));
      }
      closeForm();
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiRequest(`/users/${deleteTarget.id}`, { method: 'DELETE', token: token() });
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to delete user');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  const availableRoles = isAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r.value !== 'admin');

  // Avatar shown in the form (edit mode)
  const editHasAvatar = editTarget?.hasAvatar && !form.deleteAvatar;
  const showAvatarPreview = avatarPreview ?? (editHasAvatar && editTarget ? avatarUrl(editTarget.id, avatarBust[editTarget.id] ?? 0) : null);

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>Team Members</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
            {users.length} user{users.length !== 1 ? 's' : ''} · add, edit or remove members
          </p>
        </div>
        <button className="comic-btn-primary" onClick={openAdd} style={{ whiteSpace: 'nowrap' }}>
          + Add User
        </button>
      </div>

      {pageError && <div className="error-banner" style={{ marginBottom: '1rem' }}>⚠️ {pageError}</div>}

      {/* Add / Edit form panel */}
      {formMode && (
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy)' }}>
            {formMode === 'add' ? '➕ New User' : `✏️ Edit — ${editTarget?.displayName}`}
          </h2>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

              {/* Display name */}
              <div>
                <label className="field-label">Display Name</label>
                <input className="comic-input" value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  required minLength={2} maxLength={100} placeholder="Jane Smith" />
              </div>

              {/* Email */}
              <div>
                <label className="field-label">Email</label>
                <input className="comic-input" type="email" value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required placeholder="jane@company.com" />
              </div>

              {/* Password */}
              <div>
                <label className="field-label">
                  Password {formMode === 'edit' && <span style={{ fontWeight: 400, textTransform: 'none' }}>(leave blank to keep)</span>}
                </label>
                <input className="comic-input" type="password" value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={formMode === 'add'} minLength={8} placeholder="Min 8 characters" autoComplete="new-password" />
              </div>

              {/* Role */}
              <div>
                <label className="field-label">Role</label>
                <select className="comic-select" value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  disabled={formMode === 'edit' && editTarget?.id === currentUser?.id}>
                  {availableRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="field-label">Mother Tongue Language</label>
                <select className="comic-select" value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>

              {/* Avatar upload */}
              <div>
                <label className="field-label">Profile Picture <span style={{ fontWeight: 400, textTransform: 'none' }}>(max {MAX_AVATAR_MB} MB)</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Preview */}
                  {showAvatarPreview ? (
                    <img src={showAvatarPreview} alt="Avatar preview"
                      style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: 'var(--border)', boxShadow: 'var(--shadow-sm)' }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0f0f0', border: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                      👤
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleAvatarChange} style={{ fontSize: '0.8rem' }} />
                    {avatarPreview && (
                      <button type="button" onClick={removeAvatarSelection}
                        style={{ fontSize: '0.75rem', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        ✕ Remove selection
                      </button>
                    )}
                    {formMode === 'edit' && editTarget?.hasAvatar && !form.deleteAvatar && !avatarPreview && (
                      <button type="button" onClick={markDeleteAvatar}
                        style={{ fontSize: '0.75rem', color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        🗑️ Delete current picture
                      </button>
                    )}
                    {form.deleteAvatar && (
                      <span style={{ fontSize: '0.75rem', color: '#e53e3e' }}>Picture will be removed on save</span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {formError && <div className="error-banner" style={{ marginTop: '1rem' }}>⚠️ {formError}</div>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="submit" className="comic-btn-primary" disabled={formLoading}>
                {formLoading ? <><span className="spinner" />Saving…</> : formMode === 'add' ? '✓ Create User' : '✓ Save Changes'}
              </button>
              <button type="button" className="comic-btn-secondary" onClick={closeForm} disabled={formLoading}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#999' }}>
            <span className="spinner" style={{ display: 'inline-block', marginRight: '0.5rem' }} />Loading users…
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#999' }}>No users yet. Add your first team member above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--navy)', color: '#fff' }}>
                {['', 'Name', 'Email', 'Language', 'Role', 'Joined', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                const badge = ROLE_BADGE[user.role] ?? { bg: 'var(--navy)', color: '#fff' };
                const isSelf = user.id === currentUser?.id;
                const bust = avatarBust[user.id] ?? 0;
                const langLabel = LANGUAGES.find((l) => l.code === user.language)?.label ?? user.language;
                return (
                  <tr key={user.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                    {/* Avatar cell */}
                    <td style={{ padding: '0.5rem 0.75rem', width: 48 }}>
                      {user.hasAvatar ? (
                        <img src={avatarUrl(user.id, bust)} alt={user.displayName}
                          style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: 'var(--border)', display: 'block' }} />
                      ) : (
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#f0f0f0', border: '2px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                          👤
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--navy)' }}>
                      {user.displayName}
                      {isSelf && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#999', fontWeight: 400 }}>(you)</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#555', fontSize: '0.9rem' }}>{user.email}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#555', fontSize: '0.85rem' }}>{langLabel}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ background: badge.bg, color: badge.color, border: 'var(--border)', borderRadius: 'var(--radius-pill)', padding: '0.2rem 0.7rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#888', fontSize: '0.85rem' }}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => openEdit(user)}
                          style={{ background: 'transparent', border: '2px solid var(--navy)', borderRadius: '6px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                          ✏️ Edit
                        </button>
                        <button onClick={() => setDeleteTarget(user)} disabled={isSelf}
                          title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                          style={{ background: isSelf ? '#f5f5f5' : 'transparent', border: '2px solid', borderColor: isSelf ? '#ddd' : '#e53e3e', borderRadius: '6px', padding: '0.3rem 0.7rem', cursor: isSelf ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 700, color: isSelf ? '#aaa' : '#e53e3e', opacity: isSelf ? 0.5 : 1 }}>
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚠️</div>
            <h3 style={{ margin: '0 0 0.5rem', fontWeight: 900, color: 'var(--navy)' }}>Delete User?</h3>
            <p style={{ color: '#555', margin: '0 0 1.5rem' }}>
              Delete <strong>{deleteTarget.displayName}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => void handleDelete()} disabled={deleteLoading}
                style={{ background: '#e53e3e', color: '#fff', border: '2.5px solid var(--navy)', borderRadius: 'var(--radius-pill)', padding: '0.6rem 1.5rem', fontWeight: 800, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                {deleteLoading ? 'Deleting…' : '🗑️ Yes, Delete'}
              </button>
              <button className="comic-btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
