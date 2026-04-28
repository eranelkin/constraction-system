import { beforeAll, afterAll, beforeEach } from 'vitest';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';
import type { AppContainer } from '../container.js';
import type { Express } from 'express';

// Shared across the entire test process
let container: AppContainer;
let app: Express;

beforeAll(async () => {
  container = await buildContainer();
  app = createApp(container);

  // Run migrations so tables exist
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(resolve(__dirname, '../database/migrations/001_initial.sql'), 'utf-8');
  await container.db.query(sql);
});

afterAll(async () => {
  await container.db.close();
});

// Wipe auth tables before each test for isolation
beforeEach(async () => {
  await container.db.query('DELETE FROM refresh_tokens');
  await container.db.query('DELETE FROM users');
});

// Expose to tests without re-building
export function getApp(): Express {
  return app;
}

export function getContainer(): AppContainer {
  return container;
}
