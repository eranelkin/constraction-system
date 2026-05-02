import type { Group, PublicGroup, GroupMember, CreateGroupDTO, UpdateGroupDTO } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IGroupRepository } from './IGroupRepository.js';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  emoji: string | null;
  conversation_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface MemberRow {
  group_id: string;
  user_id: string;
  display_name: string;
  joined_at: Date;
}

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    emoji: row.emoji,
    conversationId: row.conversation_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMember(row: MemberRow): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    displayName: row.display_name,
    joinedAt: row.joined_at,
  };
}

export class GroupRepository implements IGroupRepository {
  constructor(private readonly db: IDatabase) {}

  async listAll(): Promise<PublicGroup[]> {
    const { rows: groupRows } = await this.db.query<GroupRow & { member_count: string }>(
      `SELECT g.*, COUNT(gm.user_id)::text AS member_count
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name`,
      [],
    );

    if (groupRows.length === 0) return [];

    const groupIds = groupRows.map((r) => r.id);
    const { rows: memberRows } = await this.db.query<MemberRow>(
      `SELECT gm.group_id, gm.user_id, u.display_name, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ANY($1)
       ORDER BY u.display_name`,
      [groupIds],
    );

    const membersByGroup = new Map<string, GroupMember[]>();
    for (const row of memberRows) {
      const list = membersByGroup.get(row.group_id) ?? [];
      list.push(rowToMember(row));
      membersByGroup.set(row.group_id, list);
    }

    return groupRows.map((row) => ({
      ...rowToGroup(row),
      memberCount: parseInt(row.member_count, 10),
      members: membersByGroup.get(row.id) ?? [],
    }));
  }

  async findById(id: string): Promise<PublicGroup | null> {
    const row = await this.db.queryOne<GroupRow>(
      'SELECT * FROM groups WHERE id = $1',
      [id],
    );
    if (!row) return null;

    const { rows: memberRows } = await this.db.query<MemberRow>(
      `SELECT gm.group_id, gm.user_id, u.display_name, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY u.display_name`,
      [id],
    );

    return {
      ...rowToGroup(row),
      memberCount: memberRows.length,
      members: memberRows.map(rowToMember),
    };
  }

  async create(data: CreateGroupDTO): Promise<Group> {
    const row = await this.db.queryOne<GroupRow>(
      `INSERT INTO groups (name, description, color, emoji, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.name, data.description ?? null, data.color ?? null, data.emoji ?? null, data.createdBy],
    );
    if (!row) throw new Error('Group creation failed');
    return rowToGroup(row);
  }

  async update(id: string, data: UpdateGroupDTO): Promise<Group | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.name !== undefined)        { fields.push(`name = $${i++}`);        values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${i++}`); values.push(data.description); }
    if (data.color !== undefined)       { fields.push(`color = $${i++}`);       values.push(data.color); }
    if (data.emoji !== undefined)       { fields.push(`emoji = $${i++}`);       values.push(data.emoji); }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const row = await this.db.queryOne<GroupRow>(
      `UPDATE groups SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    return row ? rowToGroup(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM groups WHERE id = $1', [id]);
  }

  async addMember(groupId: string, userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, userId],
    );
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
  }

  async setMembers(groupId: string, userIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM group_members WHERE group_id = $1', [groupId]);
      if (userIds.length > 0) {
        const placeholders = userIds.map((_, idx) => `($1, $${idx + 2})`).join(', ');
        await tx.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ${placeholders}`,
          [groupId, ...userIds],
        );
      }
    });
  }

  async listByUserId(userId: string): Promise<Group[]> {
    const { rows } = await this.db.query<GroupRow>(
      `SELECT g.* FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.name`,
      [userId],
    );
    return rows.map(rowToGroup);
  }

  async setConversationId(groupId: string, conversationId: string): Promise<void> {
    await this.db.query(
      'UPDATE groups SET conversation_id = $1, updated_at = NOW() WHERE id = $2',
      [conversationId, groupId],
    );
  }

  async syncUserMemberships(userId: string, groupIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM group_members WHERE user_id = $1', [userId]);
      if (groupIds.length > 0) {
        const placeholders = groupIds.map((_, idx) => `($${idx + 1}, $${groupIds.length + 1})`).join(', ');
        await tx.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ${placeholders}
           ON CONFLICT (group_id, user_id) DO NOTHING`,
          [...groupIds, userId],
        );
      }
    });
  }
}
