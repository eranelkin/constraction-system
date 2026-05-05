import type { User, CreateUserDTO, UpdateUserDTO, PublicUser, ContactUser } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IUserRepository, AvatarData } from './IUserRepository.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  language: string;
  email_verified: boolean;
  is_active: boolean;
  can_send_voice: boolean;
  can_send_video: boolean;
  created_at: Date;
  avatar_data: Buffer | null;
  avatar_mime_type: string | null;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role as User['role'],
    language: row.language,
    emailVerified: row.email_verified,
    isActive: row.is_active,
    canSendVoice: row.can_send_voice,
    canSendVideo: row.can_send_video,
    createdAt: row.created_at,
  };
}

function rowToPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as User['role'],
    language: row.language,
    emailVerified: row.email_verified,
    isActive: row.is_active,
    canSendVoice: row.can_send_voice,
    canSendVideo: row.can_send_video,
    createdAt: row.created_at,
    hasAvatar: row.avatar_data !== null,
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

  async listAllFull(): Promise<PublicUser[]> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT * FROM users ORDER BY display_name ASC',
      [],
    );
    return rows.map(rowToPublicUser);
  }

  async countByRole(role: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users WHERE role = $1',
      [role],
    );
    return parseInt(row?.count ?? '0', 10);
  }

  async listAll(excludeId: string): Promise<ContactUser[]> {
    const { rows } = await this.db.query<{ id: string; display_name: string; role: string }>(
      'SELECT id, display_name, role FROM users WHERE id != $1 AND is_active = true ORDER BY display_name ASC',
      [excludeId],
    );
    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      role: r.role as ContactUser['role'],
    }));
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
      `INSERT INTO users (email, password_hash, display_name, role, language, avatar_data, avatar_mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.email,
        data.passwordHash,
        data.displayName,
        data.role,
        data.language,
        data.avatarData ?? null,
        data.avatarMimeType ?? null,
      ],
    );
    if (!row) throw new Error('User creation failed — no row returned');
    return rowToUser(row);
  }

  async update(id: string, data: UpdateUserDTO): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.displayName !== undefined)  { fields.push(`display_name = $${idx++}`);  values.push(data.displayName); }
    if (data.email !== undefined)        { fields.push(`email = $${idx++}`);          values.push(data.email); }
    if (data.role !== undefined)         { fields.push(`role = $${idx++}`);           values.push(data.role); }
    if (data.passwordHash !== undefined) { fields.push(`password_hash = $${idx++}`); values.push(data.passwordHash); }
    if (data.emailVerified !== undefined){ fields.push(`email_verified = $${idx++}`); values.push(data.emailVerified); }
    if (data.language !== undefined)     { fields.push(`language = $${idx++}`);       values.push(data.language); }
    if (data.isActive !== undefined)     { fields.push(`is_active = $${idx++}`);      values.push(data.isActive); }
    if (data.canSendVoice !== undefined) { fields.push(`can_send_voice = $${idx++}`); values.push(data.canSendVoice); }
    if (data.canSendVideo !== undefined) { fields.push(`can_send_video = $${idx++}`); values.push(data.canSendVideo); }

    // avatarData: null → clear, Buffer → set, undefined → no change
    if (data.avatarData !== undefined) {
      fields.push(`avatar_data = $${idx++}`);
      values.push(data.avatarData);
      fields.push(`avatar_mime_type = $${idx++}`);
      values.push(data.avatarMimeType ?? null);
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

  async getAvatar(id: string): Promise<AvatarData | null> {
    const row = await this.db.queryOne<{ avatar_data: Buffer | null; avatar_mime_type: string | null }>(
      'SELECT avatar_data, avatar_mime_type FROM users WHERE id = $1',
      [id],
    );
    if (!row?.avatar_data || !row.avatar_mime_type) return null;
    return { data: row.avatar_data, mimeType: row.avatar_mime_type };
  }
}
