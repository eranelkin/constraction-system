import bcrypt from 'bcryptjs';
import pg from 'pg';
import { config } from '@constractor/config';

const DEV_USERS = [
  { email: 'admin@constractor.dev',   password: 'Admin1234!',   displayName: 'Admin User',   role: 'admin' },
  { email: 'manager@constractor.dev', password: 'Manager1234!', displayName: 'Manager User', role: 'manager' },
] as const;

async function seed() {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  try {
    for (const u of DEV_USERS) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      await pool.query(
        `INSERT INTO users (email, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [u.email, passwordHash, u.displayName, u.role],
      );
      console.log(`✓ ${u.role}: ${u.email}`);
    }
    console.log('\nDev users seeded. Credentials:');
    for (const u of DEV_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}  /  ${u.password}`);
  } finally {
    await pool.end();
  }
}

seed().catch((err) => { console.error(err); process.exit(1); });
