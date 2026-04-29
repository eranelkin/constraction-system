import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';

async function registerUser(email: string, displayName = 'User') {
  const res = await request(getApp()).post('/auth/register').send({
    email,
    password: 'password123',
    displayName,
    role: 'contractor',
  });
  return res.body as {
    user: { id: string; email: string; displayName: string };
    tokens: { accessToken: string; refreshToken: string };
  };
}

function auth(token: string) {
  return `Bearer ${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /messaging/conversations', () => {
  it('creates a new conversation between two users', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    const res = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    expect(res.status).toBe(201);
    expect(res.body.conversation.id).toBeTruthy();
    const participants = res.body.conversation.participants as Array<{ userId: string }>;
    expect(participants.map((p) => p.userId)).toContain(alice.user.id);
    expect(participants.map((p) => p.userId)).toContain(bob.user.id);
  });

  it('is idempotent — returns the same conversation on repeat calls', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    const first = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const second = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    expect(first.body.conversation.id).toBe(second.body.conversation.id);
  });

  it('requires authentication', async () => {
    const bob = await registerUser('bob@example.com', 'Bob');
    const res = await request(getApp())
      .post('/messaging/conversations')
      .send({ participantId: bob.user.id });
    expect(res.status).toBe(401);
  });

  it('rejects invalid participantId', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const res = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: 'not-a-uuid' });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /messaging/conversations', () => {
  it('returns conversations for the authenticated user', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const res = await request(getApp())
      .get('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(1);
  });

  it('does not return conversations the user is not part of', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');
    const carol = await registerUser('carol@example.com', 'Carol');

    await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const res = await request(getApp())
      .get('/messaging/conversations')
      .set('Authorization', auth(carol.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(0);
  });

  it('requires authentication', async () => {
    const res = await request(getApp()).get('/messaging/conversations');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /messaging/conversations/:id/messages', () => {
  it('sends a message and returns it', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    const msgRes = await request(getApp())
      .post(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ body: 'Hello Bob!' });

    expect(msgRes.status).toBe(201);
    expect(msgRes.body.message.body).toBe('Hello Bob!');
    expect(msgRes.body.message.senderId).toBe(alice.user.id);
    expect(msgRes.body.message.senderName).toBe('Alice');
  });

  it('returns 403 for non-participant', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');
    const carol = await registerUser('carol@example.com', 'Carol');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    const res = await request(getApp())
      .post(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(carol.tokens.accessToken))
      .send({ body: 'Sneaky!' });

    expect(res.status).toBe(403);
  });

  it('rejects empty body', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    const res = await request(getApp())
      .post(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ body: '' });

    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /messaging/conversations/:id/messages', () => {
  it('returns messages in the conversation', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    await request(getApp())
      .post(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ body: 'Hi!' });

    const res = await request(getApp())
      .get(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(bob.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].body).toBe('Hi!');
  });

  it('respects ?after cursor — only returns newer messages', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    const m1 = await request(getApp())
      .post(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ body: 'First' });

    await request(getApp())
      .post(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ body: 'Second' });

    const afterId: string = m1.body.message.id as string;

    const res = await request(getApp())
      .get(`/messaging/conversations/${convId}/messages?after=${afterId}`)
      .set('Authorization', auth(bob.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].body).toBe('Second');
  });

  it('returns 403 for non-participant', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');
    const carol = await registerUser('carol@example.com', 'Carol');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    const res = await request(getApp())
      .get(`/messaging/conversations/${convId}/messages`)
      .set('Authorization', auth(carol.tokens.accessToken));

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /messaging/conversations/:id/read', () => {
  it('marks the conversation as read and returns 204', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    const res = await request(getApp())
      .post(`/messaging/conversations/${convId}/read`)
      .set('Authorization', auth(alice.tokens.accessToken));

    expect(res.status).toBe(204);
  });

  it('returns 403 for non-participant', async () => {
    const alice = await registerUser('alice@example.com', 'Alice');
    const bob = await registerUser('bob@example.com', 'Bob');
    const carol = await registerUser('carol@example.com', 'Carol');

    const convRes = await request(getApp())
      .post('/messaging/conversations')
      .set('Authorization', auth(alice.tokens.accessToken))
      .send({ participantId: bob.user.id });

    const convId: string = convRes.body.conversation.id as string;

    const res = await request(getApp())
      .post(`/messaging/conversations/${convId}/read`)
      .set('Authorization', auth(carol.tokens.accessToken));

    expect(res.status).toBe(403);
  });
});
