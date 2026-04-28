import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';

const VALID_USER = {
  email: 'alice@example.com',
  password: 'securepassword1',
  displayName: 'Alice',
  role: 'contractor' as const,
};

// Helper: register and return tokens
async function registerUser(overrides = {}) {
  const res = await request(getApp())
    .post('/auth/register')
    .send({ ...VALID_USER, ...overrides });
  return res;
}

async function getTokens(overrides = {}) {
  const res = await registerUser(overrides);
  return res.body as { user: Record<string, unknown>; tokens: { accessToken: string; refreshToken: string; expiresIn: number } };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(getApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /auth/register', () => {
  it('creates a new user and returns tokens', async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: VALID_USER.email,
      displayName: VALID_USER.displayName,
      role: VALID_USER.role,
      emailVerified: false,
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.tokens.refreshToken).toBeTruthy();
    expect(res.body.tokens.expiresIn).toBe(900);
  });

  it('rejects duplicate email', async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('rejects invalid email', async () => {
    const res = await registerUser({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.email).toBeDefined();
  });

  it('rejects password shorter than 8 characters', async () => {
    const res = await registerUser({ password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.details.password).toBeDefined();
  });

  it('rejects invalid role', async () => {
    const res = await registerUser({ role: 'superuser' });
    expect(res.status).toBe(422);
    expect(res.body.details.role).toBeDefined();
  });

  it('accepts all valid roles', async () => {
    for (const role of ['admin', 'contractor', 'client']) {
      const res = await registerUser({ email: `${role}@example.com`, role });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe(role);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    await registerUser();
    const res = await request(getApp())
      .post('/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    await registerUser();
    const res = await request(getApp())
      .post('/auth/login')
      .send({ email: VALID_USER.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(getApp())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'anything' });
    expect(res.status).toBe(401);
  });

  it('rejects missing body fields', async () => {
    const res = await request(getApp())
      .post('/auth/login')
      .send({ email: VALID_USER.email });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /auth/me', () => {
  it('returns the authenticated user', async () => {
    const { user, tokens } = await getTokens();
    const res = await request(getApp())
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe(VALID_USER.email);
  });

  it('rejects missing Authorization header', async () => {
    const res = await request(getApp()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects malformed token', async () => {
    const res = await request(getApp())
      .get('/auth/me')
      .set('Authorization', 'Bearer this.is.garbage');
    expect(res.status).toBe(401);
  });

  it('rejects Bearer prefix missing', async () => {
    const { tokens } = await getTokens();
    const res = await request(getApp())
      .get('/auth/me')
      .set('Authorization', tokens.accessToken); // no "Bearer " prefix
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /auth/refresh', () => {
  it('issues a new token pair', async () => {
    const { tokens: original } = await getTokens();
    const res = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.tokens.refreshToken).toBeTruthy();
    // Refresh token is always a new UUID
    expect(res.body.tokens.refreshToken).not.toBe(original.refreshToken);
    // New access token is usable
    const meRes = await request(getApp())
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.tokens.accessToken}`);
    expect(meRes.status).toBe(200);
  });

  it('old refresh token is invalid after rotation', async () => {
    const { tokens: original } = await getTokens();
    // Use the token once
    await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken });
    // Try to use it again
    const res = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken });
    expect(res.status).toBe(401);
  });

  it('new refresh token is usable', async () => {
    const { tokens: original } = await getTokens();
    const rotated = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken });
    const res = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.tokens.refreshToken });
    expect(res.status).toBe(200);
  });

  it('rejects invalid UUID', async () => {
    const res = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-uuid' });
    expect(res.status).toBe(422);
  });

  it('rejects unknown refresh token', async () => {
    const res = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /auth/logout', () => {
  it('returns 204 and revokes the token', async () => {
    const { tokens } = await getTokens();
    const logoutRes = await request(getApp())
      .post('/auth/logout')
      .send({ refreshToken: tokens.refreshToken });
    expect(logoutRes.status).toBe(204);

    // Token is now invalid
    const refreshRes = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('is idempotent — second logout on same token still returns 204', async () => {
    const { tokens } = await getTokens();
    await request(getApp()).post('/auth/logout').send({ refreshToken: tokens.refreshToken });
    const res = await request(getApp()).post('/auth/logout').send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(204);
  });

  it('rejects missing refreshToken', async () => {
    const res = await request(getApp()).post('/auth/logout').send({});
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Token reuse attack detection', () => {
  it('revokes all sessions when a rotated-away token is reused', async () => {
    const { tokens: original } = await getTokens();

    // Legitimate rotation
    const rotated = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken });
    const newRefreshToken = rotated.body.tokens.refreshToken as string;

    // Attacker replays the old (now revoked) token
    const attackRes = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken });
    expect(attackRes.status).toBe(401);

    // Legitimate user's new token is also now invalid (all sessions revoked)
    const legitRes = await request(getApp())
      .post('/auth/refresh')
      .send({ refreshToken: newRefreshToken });
    expect(legitRes.status).toBe(401);
  });
});
