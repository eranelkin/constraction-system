'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser } from '@/lib/auth/session';
import type {
  ListGroupsResponse, GroupResponse, CreateGroupRequest, UpdateGroupRequest, PublicGroup,
  ListUsersResponse, PublicUser,
} from '@constractor/types';

const EMOJI_OPTIONS = ['🏗️','🔨','🏠','🏢','⚡','🔧','🪛','🛠️','🚧','🧱','🪚','💡','📋','👷','🌍'];
const COLOR_OPTIONS = ['#FF6B2B','#1C1C2E','#FFD93D','#4ECDC4','#45B7D1','#96CEB4','#E53935','#8E24AA','#00ACC1','#43A047'];

type FormMode = 'add' | 'edit';

interface GroupFormData {
  name: string;
  description: string;
  color: string;
  emoji: string;
  memberIds: string[];
}

const EMPTY_FORM: GroupFormData = { name: '', description: '', color: '#FF6B2B', emoji: '🏗️', memberIds: [] };

export default function GroupsPage() {
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editTarget, setEditTarget] = useState<PublicGroup | null>(null);
  const [form, setForm] = useState<GroupFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicGroup | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const token = () => getAccessToken() ?? '';

  const loadData = useCallback(async () => {
    try {
      const [gData, uData] = await Promise.all([
        apiRequest<ListGroupsResponse>('/groups', { token: token() }),
        apiRequest<ListUsersResponse>('/users', { token: token() }),
      ]);
      setGroups(gData.groups);
      setUsers(uData.users);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadData(); }, [loadData]);

  function openAdd() {
    setFormMode('add');
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
  }

  function openEdit(group: PublicGroup) {
    setFormMode('edit');
    setEditTarget(group);
    setForm({
      name: group.name,
      description: group.description ?? '',
      color: group.color ?? '#FF6B2B',
      emoji: group.emoji ?? '🏗️',
      memberIds: group.members.map((m) => m.userId),
    });
    setFormError(null);
  }

  function closeForm() {
    setFormMode(null);
    setEditTarget(null);
    setFormError(null);
  }

  function toggleMember(userId: string) {
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(userId)
        ? f.memberIds.filter((id) => id !== userId)
        : [...f.memberIds, userId],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      if (formMode === 'add') {
        const body: CreateGroupRequest = {
          name: form.name,
          memberIds: form.memberIds,
          ...(form.description && { description: form.description }),
          ...(form.color && { color: form.color }),
          ...(form.emoji && { emoji: form.emoji }),
        };
        await apiRequest<GroupResponse>('/groups', { method: 'POST', body, token: token() });

      } else if (formMode === 'edit' && editTarget) {
        const body: UpdateGroupRequest = {
          name: form.name,
          description: form.description || null,
          color: form.color || null,
          emoji: form.emoji || null,
        };
        await apiRequest<GroupResponse>(`/groups/${editTarget.id}`, { method: 'PATCH', body, token: token() });

        // Sync members via dedicated endpoint
        await apiRequest(`/groups/${editTarget.id}/members/set`, {
          method: 'PUT',
          body: { userIds: form.memberIds },
          token: token(),
        });
      }
      closeForm();
      await loadData();
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
      await apiRequest(`/groups/${deleteTarget.id}`, { method: 'DELETE', token: token() });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to delete group');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: 'var(--navy)' }}>Groups</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
            {groups.length} group{groups.length !== 1 ? 's' : ''} · create, edit or remove groups
          </p>
        </div>
        <button className="comic-btn-primary" onClick={openAdd} style={{ whiteSpace: 'nowrap' }}>
          + New Group
        </button>
      </div>

      {pageError && <div className="error-banner" style={{ marginBottom: '1rem' }}>⚠️ {pageError}</div>}

      {/* Add / Edit form panel */}
      {formMode && (
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy)' }}>
            {formMode === 'add' ? '➕ New Group' : `✏️ Edit — ${editTarget?.name}`}
          </h2>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

              {/* Name */}
              <div>
                <label className="field-label">Group Name *</label>
                <input className="comic-input" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required minLength={1} maxLength={100} placeholder="e.g. Electricians" />
              </div>

              {/* Description */}
              <div>
                <label className="field-label">Description</label>
                <input className="comic-input" value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={500} placeholder="Optional description" />
              </div>

              {/* Emoji picker */}
              <div>
                <label className="field-label">Emoji</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                  {EMOJI_OPTIONS.map((em) => (
                    <button key={em} type="button"
                      onClick={() => setForm((f) => ({ ...f, emoji: em }))}
                      style={{
                        width: 36, height: 36, fontSize: '1.2rem', borderRadius: 8, cursor: 'pointer',
                        border: form.emoji === em ? '2.5px solid var(--orange)' : '2px solid #ddd',
                        background: form.emoji === em ? '#fff8f5' : '#fff',
                        boxShadow: form.emoji === em ? 'var(--shadow-sm)' : 'none',
                      }}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="field-label">Color</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {COLOR_OPTIONS.map((c) => (
                    <button key={c} type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                        border: form.color === c ? '3px solid var(--navy)' : '2px solid rgba(0,0,0,0.15)',
                        outline: form.color === c ? '2px solid white' : 'none',
                        outlineOffset: '-4px',
                      }} />
                  ))}
                </div>
              </div>

              {/* Members multi-select */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">Members ({form.memberIds.length} selected)</label>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '2.5px solid var(--navy)', borderRadius: 10, padding: '0.5rem', marginTop: '0.25rem', background: '#fafafa' }}>
                  {users.length === 0 ? (
                    <span style={{ color: '#999', fontSize: '0.875rem' }}>No users available</span>
                  ) : (
                    users.map((u) => {
                      const checked = form.memberIds.includes(u.id);
                      return (
                        <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: 6, cursor: 'pointer', background: checked ? '#fff8f5' : 'transparent', marginBottom: 2 }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleMember(u.id)}
                            style={{ width: 16, height: 16, accentColor: 'var(--orange)', cursor: 'pointer' }} />
                          <span style={{ fontWeight: checked ? 700 : 400, color: 'var(--navy)', fontSize: '0.9rem' }}>
                            {u.displayName}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: 'auto' }}>{u.role}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {formError && <div className="error-banner" style={{ marginTop: '1rem' }}>⚠️ {formError}</div>}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="submit" className="comic-btn-primary" disabled={formLoading}>
                {formLoading ? <><span className="spinner" />Saving…</> : formMode === 'add' ? '✓ Create Group' : '✓ Save Changes'}
              </button>
              <button type="button" className="comic-btn-secondary" onClick={closeForm} disabled={formLoading}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Groups table */}
      <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#999' }}>
            <span className="spinner" style={{ display: 'inline-block', marginRight: '0.5rem' }} />Loading groups…
          </div>
        ) : groups.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#999' }}>No groups yet. Create your first group above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--navy)', color: '#fff' }}>
                {['Group', 'Description', 'Members', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group, i) => (
                <tr key={group.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                  {/* Group name + badge */}
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: group.color ?? '#FF6B2B', border: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                        {group.emoji ?? '🏗️'}
                      </div>
                      <span style={{ fontWeight: 800, color: 'var(--navy)' }}>{group.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#666', fontSize: '0.875rem', maxWidth: 260 }}>
                    {group.description ?? <span style={{ color: '#bbb' }}>—</span>}
                  </td>
                  {/* Members avatars */}
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {group.members.slice(0, 5).map((m) => (
                        <span key={m.userId} title={m.displayName}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: group.color ?? 'var(--orange)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                          {m.displayName.charAt(0).toUpperCase()}
                        </span>
                      ))}
                      {group.memberCount > 5 && (
                        <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: 2 }}>+{group.memberCount - 5}</span>
                      )}
                      {group.memberCount === 0 && <span style={{ color: '#bbb', fontSize: '0.825rem' }}>No members</span>}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => openEdit(group)}
                        style={{ background: 'transparent', border: '2px solid var(--navy)', borderRadius: '6px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => setDeleteTarget(group)}
                        style={{ background: 'transparent', border: '2px solid #e53e3e', borderRadius: '6px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#e53e3e' }}>
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚠️</div>
            <h3 style={{ margin: '0 0 0.5rem', fontWeight: 900, color: 'var(--navy)' }}>Delete Group?</h3>
            <p style={{ color: '#555', margin: '0 0 1.5rem' }}>
              Delete <strong>{deleteTarget.name}</strong>? This will also remove the group conversation. Cannot be undone.
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
