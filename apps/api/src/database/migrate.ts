import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@constractor/config';
import { PostgreSQLAdapter } from './adapters/PostgreSQLAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('Running database migrations…');
  const db = new PostgreSQLAdapter(config.DATABASE_URL);

  const migrationPath = resolve(__dirname, 'migrations', '001_initial.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  await db.query(sql);
  await db.close();

  console.log('✅ Migrations complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
