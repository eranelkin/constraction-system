import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@constractor/config';
import { PostgreSQLAdapter } from './adapters/PostgreSQLAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('Running database migrations…');
  const db = new PostgreSQLAdapter(config.DATABASE_URL);

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await db.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename',
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  const migrationsDir = resolve(__dirname, 'migrations');
  const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }
    console.log(`  → ${file}`);
    const sql = await readFile(resolve(migrationsDir, file), 'utf-8');
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    ran++;
  }

  await db.close();
  if (ran === 0) {
    console.log('✅ All migrations already applied.');
  } else {
    console.log(`✅ Applied ${ran} migration(s).`);
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
