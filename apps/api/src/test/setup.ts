import { beforeAll, afterAll, beforeEach } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';
import type { AppContainer } from '../container.js';
import type { Express } from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Module-level singletons — shared across all test files in the same process
let container: AppContainer;
let app: Express;
let migrated = false;

beforeAll(async () => {
  if (!container) {
    container = await buildContainer();
    app = createApp(container);
  }

  if (!migrated) {
    const migrationsDir = resolve(__dirname, '../database/migrations');
    const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(resolve(migrationsDir, file), 'utf-8');
      await container.db.query(sql);
    }
    migrated = true;
  }
});

afterAll(async () => {
  // Only close on the very last suite — check via a flag or just don't close
  // Vitest will end the process, pool cleanup happens automatically
});

beforeEach(async () => {
  await container.db.query(
    'TRUNCATE job_applications, jobs, messages, conversation_participants, conversations, refresh_tokens, users CASCADE',
  );
});

export function getApp(): Express {
  return app;
}

export function getContainer(): AppContainer {
  return container;
}
