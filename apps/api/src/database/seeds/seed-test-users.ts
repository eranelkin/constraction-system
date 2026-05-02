import bcrypt from 'bcryptjs';
import pg from 'pg';
import { config } from '@constractor/config';

const TEST_USERS = [
  { email: 'member1@test.com',  password: 'Test1234!', displayName: 'Test Member 1',  role: 'member'  },
  { email: 'member2@test.com',  password: 'Test1234!', displayName: 'Test Member 2',  role: 'member'  },
  { email: 'manager1@test.com', password: 'Test1234!', displayName: 'Test Manager 1', role: 'manager' },
] as const;

async function seedTestUsers() {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  try {
    for (const u of TEST_USERS) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, display_name, role, language, is_active)
         VALUES ($1, $2, $3, $4, 'en', true)
         ON CONFLICT (email) DO NOTHING`,
        [u.email, passwordHash, u.displayName, u.role],
      );
      const created = (result.rowCount ?? 0) > 0;
      console.log(`${created ? '✓ Created' : '— Already exists'}: ${u.role.padEnd(8)} ${u.email}`);
    }
    console.log('\nTest user credentials (password for all: Test1234!)');
    for (const u of TEST_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  } finally {
    await pool.end();
  }
}

seedTestUsers().catch((err) => { console.error(err); process.exit(1); });
