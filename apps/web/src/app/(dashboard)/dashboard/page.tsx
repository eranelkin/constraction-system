'use client';

import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { getAccessToken, getStoredUser, clearSession } from '@/lib/auth/session';
import type {
  ListConversationsResponse,
  ListUsersResponse,
  ListMessagesResponse,
  SendMessageResponse,
  StartConversationResponse,
  ConversationSummary,
  ContactUser,
  Message,
  AuthUser,
} from '@constractor/types';

type LeftTab = 'chats' | 'people';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('chats');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function token() {
    return getAccessToken() ?? '';
  }

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiRequest<ListConversationsResponse>('/messaging/conversations', {
        token: token(),
      });
      setConversations(data.conversations);
    } catch {
      // ignore background refresh errors
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const data = await apiRequest<ListUsersResponse>('/auth/users', { token: token() });
      setContacts(data.users);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadContacts();
  }, [loadConversations, loadContacts]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const data = await apiRequest<ListMessagesResponse>(
        `/messaging/conversations/${convId}/messages`,
        { token: token() },
      );
      setMessages(data.messages);
      lastMessageIdRef.current = data.messages.at(-1)?.id;
    } catch {
      setError('Failed to load messages');
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    lastMessageIdRef.current = undefined;
    setMessages([]);
    loadMessages(selectedId);

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      if (!selectedId) return;
      const after = lastMessageIdRef.current;
      const url = after
        ? `/messaging/conversations/${selectedId}/messages?after=${after}`
        : `/messaging/conversations/${selectedId}/messages`;
      try {
        const data = await apiRequest<ListMessagesResponse>(url, { token: token() });
        if (data.messages.length > 0) {
          setMessages((prev) => [...prev, ...data.messages]);
          lastMessageIdRef.current = data.messages.at(-1)?.id;
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [selectedId, loadMessages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !messageInput.trim()) return;
    const body = messageInput.trim();
    setMessageInput('');
    try {
      const data = await apiRequest<SendMessageResponse>(
        `/messaging/conversations/${selectedId}/messages`,
        { method: 'POST', body: { body }, token: token() },
      );
      setMessages((prev) => [...prev, data.message]);
      lastMessageIdRef.current = data.message.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
  }

  async function handleSelectContact(contact: ContactUser) {
    try {
      const data = await apiRequest<StartConversationResponse>('/messaging/conversations', {
        method: 'POST',
        body: { participantId: contact.id },
        token: token(),
      });
      await loadConversations();
      setSelectedId(data.conversation.id);
      setLeftTab('chats');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open conversation');
    }
  }

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  const otherParticipants = (conv: ConversationSummary) =>
    conv.participants.filter((p) => p.userId !== user?.id);

  const roleLabel = (role: string) =>
    role === 'client' ? 'Client' : 'Contractor';

  const roleColor = (role: string) =>
    role === 'client' ? '#2563eb' : '#7c3aed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
        <strong style={{ fontSize: '1rem' }}>Constractor</strong>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => router.push('/jobs')} style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
            Job Board
          </button>
          <button onClick={() => router.push('/my-jobs')} style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
            My Jobs
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
            {user?.displayName}
          </span>
          <button onClick={handleLogout} style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', padding: '0.5rem 1rem', fontSize: '0.875rem', color: '#dc2626' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '1rem', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel */}
        <div style={{ width: '280px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            {(['chats', 'people'] as LeftTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: leftTab === tab ? 600 : 400,
                  color: leftTab === tab ? '#2563eb' : '#64748b',
                  borderBottom: leftTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab === 'chats' ? '💬 Chats' : '👥 People'}
              </button>
            ))}
          </div>

          {/* Chats tab */}
          {leftTab === 'chats' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {conversations.length === 0 ? (
                <p style={{ padding: '1rem', fontSize: '0.875rem', color: '#94a3b8', textAlign: 'center' }}>
                  No conversations yet.{' '}
                  <button
                    onClick={() => setLeftTab('people')}
                    style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
                  >
                    Message someone →
                  </button>
                </p>
              ) : (
                conversations.map((conv) => {
                  const others = otherParticipants(conv);
                  const label = others.length > 0 ? others.map((p) => p.displayName).join(', ') : 'Conversation';
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.75rem 1rem',
                        border: 'none',
                        borderBottom: '1px solid #e2e8f0',
                        background: selectedId === conv.id ? '#dbeafe' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#1e293b' }}>{label}</div>
                      {conv.lastMessage && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conv.lastMessage.body}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* People tab */}
          {leftTab === 'people' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {contacts.length === 0 ? (
                <p style={{ padding: '1rem', fontSize: '0.875rem', color: '#94a3b8', textAlign: 'center' }}>
                  No other users yet.
                </p>
              ) : (
                contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleSelectContact(contact)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      border: 'none',
                      borderBottom: '1px solid #e2e8f0',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: roleColor(contact.role),
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {contact.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#1e293b' }}>{contact.displayName}</div>
                      <div style={{ fontSize: '0.7rem', color: roleColor(contact.role), fontWeight: 500, marginTop: '0.1rem' }}>
                        {roleLabel(contact.role)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right panel: messages */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
          {!selectedId ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '0.5rem' }}>
              <div style={{ fontSize: '2rem' }}>💬</div>
              <div style={{ fontSize: '0.875rem' }}>Select a chat or message someone from People</div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              {(() => {
                const conv = conversations.find((c) => c.id === selectedId);
                const others = conv ? otherParticipants(conv) : [];
                const label = others.length > 0 ? others.map((p) => p.displayName).join(', ') : 'Conversation';
                return (
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
                    {label}
                  </div>
                );
              })()}

              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {messages.map((msg) => {
                  const isMe = msg.senderId === user?.id;
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '70%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '12px',
                        background: isMe ? '#2563eb' : '#f1f5f9',
                        color: isMe ? '#fff' : '#1e293b',
                        fontSize: '0.875rem',
                      }}>
                        {!isMe && (
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', color: '#64748b' }}>
                            {msg.senderName}
                          </div>
                        )}
                        {msg.body}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                <input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message…"
                  style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderRadius: '8px', background: '#2563eb', color: '#fff', border: 'none', fontWeight: 500 }}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
