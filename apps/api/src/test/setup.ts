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
    await container.db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: applied } = await container.db.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename',
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    const migrationsDir = resolve(__dirname, '../database/migrations');
    const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = await readFile(resolve(migrationsDir, file), 'utf-8');
      await container.db.query(sql);
      await container.db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    }
    migrated = true;
  }
});

afterAll(async () => {
  // Only close on the very last suite — check via a flag or just don't close
  // Vitest will end the process, pool cleanup happens automatically
});

beforeEach(async () => {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('_test')) {
    throw new Error(
      `Refusing to truncate: DATABASE_URL does not point to a test database ("_test" not found in URL).\n` +
      `Run tests with: pnpm --filter @constractor/api test`,
    );
  }
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
