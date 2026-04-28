import type { User, CreateUserDTO, UpdateUserDTO } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IUserRepository } from './IUserRepository.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  email_verified: boolean;
  created_at: Date;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role as User['role'],
    emailVerified: row.email_verified,
    createdAt: row.created_at,
  };
}

export class UserRepository implements IUserRepository {
  constructor(private readonly db: IDatabase) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [id],
    );
    return row ? rowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [email],
    );
    return row ? rowToUser(row) : null;
  }

  async create(data: CreateUserDTO): Promise<User> {
    const row = await this.db.queryOne<UserRow>(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.email, data.passwordHash, data.displayName, data.role],
    );
    if (!row) throw new Error('User creation failed — no row returned');
    return rowToUser(row);
  }

  async update(id: string, data: UpdateUserDTO): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(data.displayName);
    }
    if (data.emailVerified !== undefined) {
      fields.push(`email_verified = $${idx++}`);
      values.push(data.emailVerified);
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const row = await this.db.queryOne<UserRow>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return row ? rowToUser(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
  }
}
