import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@constractor/config';
import { PostgreSQLAdapter } from './adapters/PostgreSQLAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('Running database migrations…');
  const db = new PostgreSQLAdapter(config.DATABASE_URL);

  const migrationsDir = resolve(__dirname, 'migrations');
  const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`  → ${file}`);
    const sql = await readFile(resolve(migrationsDir, file), 'utf-8');
    await db.query(sql);
  }

  await db.close();
  console.log('✅ Migrations complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
