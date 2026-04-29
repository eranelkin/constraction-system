import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';

type UserBody = { user: { id: string }; tokens: { accessToken: string } };

async function registerClient(email: string, displayName = 'Client'): Promise<UserBody> {
  const res = await request(getApp()).post('/auth/register').send({
    email,
    password: 'password123',
    displayName,
    role: 'client',
  });
  return res.body as UserBody;
}

async function registerContractor(email: string, displayName = 'Contractor'): Promise<UserBody> {
  const res = await request(getApp()).post('/auth/register').send({
    email,
    password: 'password123',
    displayName,
    role: 'contractor',
  });
  return res.body as UserBody;
}

function auth(token: string) {
  return `Bearer ${token}`;
}

const jobPayload = {
  title: 'Fix my roof',
  description: 'The roof is leaking after heavy rain.',
  budget: 1500,
  location: 'Tel Aviv',
};

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /jobs', () => {
  it('client creates a job (201)', async () => {
    const client = await registerClient('client1@example.com');
    const res = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);

    expect(res.status).toBe(201);
    expect(res.body.job.title).toBe(jobPayload.title);
    expect(res.body.job.budget).toBe(jobPayload.budget);
    expect(res.body.job.status).toBe('open');
    expect(res.body.job.applications).toEqual([]);
  });

  it('contractor cannot create a job (403)', async () => {
    const contractor = await registerContractor('c1@example.com');
    const res = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(contractor.tokens.accessToken))
      .send(jobPayload);
    expect(res.status).toBe(403);
  });

  it('missing required fields returns 422', async () => {
    const client = await registerClient('client2@example.com');
    const res = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send({ title: 'No budget or location' });
    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await request(getApp()).post('/jobs').send(jobPayload);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs', () => {
  it('returns open jobs for any authenticated user', async () => {
    const client = await registerClient('client3@example.com');
    const contractor = await registerContractor('c2@example.com');

    await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);

    const res = await request(getApp())
      .get('/jobs')
      .set('Authorization', auth(contractor.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThanOrEqual(1);
    expect(res.body.jobs[0].applicationCount).toBeDefined();
  });

  it('returns 401 without auth', async () => {
    const res = await request(getApp()).get('/jobs');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs/:id', () => {
  it('client sees all applications', async () => {
    const client = await registerClient('client4@example.com');
    const c1 = await registerContractor('c3@example.com', 'C1');
    const c2 = await registerContractor('c4@example.com', 'C2');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(c1.tokens.accessToken))
      .send({ coverNote: 'I can do it' });

    await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(c2.tokens.accessToken))
      .send({ coverNote: 'Me too' });

    const res = await request(getApp())
      .get(`/jobs/${jobId}`)
      .set('Authorization', auth(client.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.job.applications).toHaveLength(2);
  });

  it('contractor sees only own application', async () => {
    const client = await registerClient('client5@example.com');
    const c1 = await registerContractor('c5@example.com');
    const c2 = await registerContractor('c6@example.com');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(c1.tokens.accessToken))
      .send({ coverNote: 'I can do it' });

    await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(c2.tokens.accessToken))
      .send({ coverNote: 'Me too' });

    const res = await request(getApp())
      .get(`/jobs/${jobId}`)
      .set('Authorization', auth(c1.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.job.applications).toHaveLength(1);
    expect(res.body.job.applications[0].contractorId).toBe(c1.user.id);
  });

  it('returns 404 for unknown job', async () => {
    const client = await registerClient('client6@example.com');
    const res = await request(getApp())
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', auth(client.tokens.accessToken));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /jobs/:id/apply', () => {
  it('contractor applies successfully (201)', async () => {
    const client = await registerClient('client7@example.com');
    const contractor = await registerContractor('c7@example.com');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const res = await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(contractor.tokens.accessToken))
      .send({ coverNote: 'I have 5 years of roofing experience.' });

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe('pending');
    expect(res.body.application.contractorId).toBe(contractor.user.id);
  });

  it('duplicate application returns 409', async () => {
    const client = await registerClient('client8@example.com');
    const contractor = await registerContractor('c8@example.com');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(contractor.tokens.accessToken))
      .send({ coverNote: 'First time' });

    const res = await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(contractor.tokens.accessToken))
      .send({ coverNote: 'Second time' });

    expect(res.status).toBe(409);
  });

  it('client cannot apply (403)', async () => {
    const client = await registerClient('client9@example.com');
    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const res = await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(client.tokens.accessToken))
      .send({ coverNote: 'I am the owner' });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /jobs/:id/hire/:applicantId', () => {
  it('hires contractor: job becomes assigned, other applications rejected, conversation created', async () => {
    const client = await registerClient('client10@example.com');
    const c1 = await registerContractor('c9@example.com', 'Hired');
    const c2 = await registerContractor('c10@example.com', 'Rejected');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const app1Res = await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(c1.tokens.accessToken))
      .send({ coverNote: 'I am the best' });

    await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(c2.tokens.accessToken))
      .send({ coverNote: 'Pick me' });

    const appId: string = app1Res.body.application.id as string;

    const hireRes = await request(getApp())
      .post(`/jobs/${jobId}/hire/${appId}`)
      .set('Authorization', auth(client.tokens.accessToken));

    expect(hireRes.status).toBe(200);
    expect(hireRes.body.job.status).toBe('assigned');
    expect(hireRes.body.job.assignedContractorId).toBe(c1.user.id);

    // Check other application was rejected
    const jobDetail = await request(getApp())
      .get(`/jobs/${jobId}`)
      .set('Authorization', auth(client.tokens.accessToken));
    const apps = jobDetail.body.job.applications as Array<{ contractorId: string; status: string }>;
    const rejectedApp = apps.find((a) => a.contractorId === c2.user.id);
    expect(rejectedApp?.status).toBe('rejected');

    // Conversation should have been auto-created
    const convRes = await request(getApp())
      .get('/messaging/conversations')
      .set('Authorization', auth(client.tokens.accessToken));
    expect(convRes.status).toBe(200);
    expect(convRes.body.conversations).toHaveLength(1);
  });

  it('non-owner cannot hire (403)', async () => {
    const client1 = await registerClient('client11@example.com');
    const client2 = await registerClient('client12@example.com');
    const contractor = await registerContractor('c11@example.com');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client1.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const appRes = await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(contractor.tokens.accessToken))
      .send({ coverNote: 'Ready to work' });
    const appId: string = appRes.body.application.id as string;

    const res = await request(getApp())
      .post(`/jobs/${jobId}/hire/${appId}`)
      .set('Authorization', auth(client2.tokens.accessToken));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /jobs/:id', () => {
  it('client can complete an assigned job', async () => {
    const client = await registerClient('client13@example.com');
    const contractor = await registerContractor('c12@example.com');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const appRes = await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(contractor.tokens.accessToken))
      .send({ coverNote: 'Ready' });
    const appId: string = appRes.body.application.id as string;

    await request(getApp())
      .post(`/jobs/${jobId}/hire/${appId}`)
      .set('Authorization', auth(client.tokens.accessToken));

    const res = await request(getApp())
      .patch(`/jobs/${jobId}`)
      .set('Authorization', auth(client.tokens.accessToken))
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('completed');
  });

  it('client can cancel an open job', async () => {
    const client = await registerClient('client14@example.com');
    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const res = await request(getApp())
      .patch(`/jobs/${jobId}`)
      .set('Authorization', auth(client.tokens.accessToken))
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('cancelled');
  });

  it('cannot complete an open job (422)', async () => {
    const client = await registerClient('client15@example.com');
    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const res = await request(getApp())
      .patch(`/jobs/${jobId}`)
      .set('Authorization', auth(client.tokens.accessToken))
      .send({ status: 'completed' });
    expect(res.status).toBe(422);
  });

  it('non-owner cannot patch (403)', async () => {
    const client1 = await registerClient('client16@example.com');
    const client2 = await registerClient('client17@example.com');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client1.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    const res = await request(getApp())
      .patch(`/jobs/${jobId}`)
      .set('Authorization', auth(client2.tokens.accessToken))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /my/jobs', () => {
  it('client sees own posted jobs', async () => {
    const client = await registerClient('client18@example.com');

    await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);

    const res = await request(getApp())
      .get('/my/jobs')
      .set('Authorization', auth(client.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].clientId).toBe(client.user.id);
  });

  it('contractor gets empty array', async () => {
    const contractor = await registerContractor('c13@example.com');
    const res = await request(getApp())
      .get('/my/jobs')
      .set('Authorization', auth(contractor.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /my/applications', () => {
  it('contractor sees own applications with jobTitle and jobStatus', async () => {
    const client = await registerClient('client19@example.com');
    const contractor = await registerContractor('c14@example.com');

    const jobRes = await request(getApp())
      .post('/jobs')
      .set('Authorization', auth(client.tokens.accessToken))
      .send(jobPayload);
    const jobId: string = jobRes.body.job.id as string;

    await request(getApp())
      .post(`/jobs/${jobId}/apply`)
      .set('Authorization', auth(contractor.tokens.accessToken))
      .send({ coverNote: 'I am experienced' });

    const res = await request(getApp())
      .get('/my/applications')
      .set('Authorization', auth(contractor.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].jobTitle).toBe(jobPayload.title);
    expect(res.body.applications[0].jobStatus).toBe('open');
  });

  it('client gets empty array', async () => {
    const client = await registerClient('client20@example.com');
    const res = await request(getApp())
      .get('/my/applications')
      .set('Authorization', auth(client.tokens.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.applications).toEqual([]);
  });
});
