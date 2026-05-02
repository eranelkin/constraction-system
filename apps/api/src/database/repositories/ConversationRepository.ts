import type { Conversation, ConversationParticipant, ConversationSummary } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IConversationRepository } from './IConversationRepository.js';

interface ConversationRow {
  id: string;
  created_at: Date;
  updated_at: Date;
}

interface ParticipantRow {
  conversation_id: string;
  user_id: string;
  display_name: string;
  last_read_at: Date;
}

interface SummaryRow {
  id: string;
  updated_at: Date;
  participants: Array<{ userId: string; displayName: string; lastReadAt: Date }> | null;
  last_message_body: string | null;
  last_message_created_at: Date | null;
}

function rowToParticipant(row: ParticipantRow): ConversationParticipant {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    displayName: row.display_name,
    lastReadAt: row.last_read_at,
  };
}

export class ConversationRepository implements IConversationRepository {
  constructor(private readonly db: IDatabase) {}

  async findOrCreate(participantIds: [string, string]): Promise<Conversation> {
    const [idA, idB] = participantIds;

    const existing = await this.db.queryOne<ConversationRow>(
      `SELECT c.id, c.created_at, c.updated_at
       FROM conversations c
       JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = $1
       JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = $2
       LIMIT 1`,
      [idA, idB],
    );

    if (existing) {
      return this.fetchWithParticipants(existing);
    }

    return this.db.transaction(async (tx) => {
      const conv = await tx.queryOne<ConversationRow>(
        'INSERT INTO conversations DEFAULT VALUES RETURNING id, created_at, updated_at',
        [],
      );
      if (!conv) throw new Error('Conversation creation failed');

      await tx.query(
        `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
        [conv.id, idA, idB],
      );

      return this.fetchWithParticipants(conv, tx);
    });
  }

  async findByUserId(userId: string): Promise<ConversationSummary[]> {
    const { rows } = await this.db.query<SummaryRow>(
      `SELECT
         c.id,
         c.updated_at,
         (
           SELECT json_agg(json_build_object(
             'userId', u.id,
             'displayName', u.display_name,
             'lastReadAt', cp2.last_read_at
           ))
           FROM conversation_participants cp2
           JOIN users u ON u.id = cp2.user_id
           WHERE cp2.conversation_id = c.id
         ) AS participants,
         m.body   AS last_message_body,
         m.created_at AS last_message_created_at
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC LIMIT 1
       ) m ON true
       ORDER BY c.updated_at DESC`,
      [userId],
    );

    return rows.map((row) => ({
      id: row.id,
      updatedAt: row.updated_at,
      participants: row.participants ?? [],
      lastMessage: row.last_message_body != null
        ? { body: row.last_message_body, createdAt: row.last_message_created_at as Date }
        : null,
    }));
  }

  async findById(id: string): Promise<Conversation | null> {
    const row = await this.db.queryOne<ConversationRow>(
      'SELECT id, created_at, updated_at FROM conversations WHERE id = $1',
      [id],
    );
    if (!row) return null;
    return this.fetchWithParticipants(row);
  }

  async markRead(conversationId: string, userId: string): Promise<void> {
    await this.db.query(
      `UPDATE conversation_participants SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ user_id: string }>(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId],
    );
    return row !== null;
  }

  async createGroupConversation(participantIds: string[], name: string): Promise<Conversation> {
    return this.db.transaction(async (tx) => {
      const conv = await tx.queryOne<ConversationRow>(
        `INSERT INTO conversations (name, type) VALUES ($1, 'group')
         RETURNING id, created_at, updated_at`,
        [name],
      );
      if (!conv) throw new Error('Group conversation creation failed');

      if (participantIds.length > 0) {
        const placeholders = participantIds.map((_, i) => `($1, $${i + 2})`).join(', ');
        await tx.query(
          `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ${placeholders}`,
          [conv.id, ...participantIds],
        );
      }

      return this.fetchWithParticipants(conv, tx);
    });
  }

  async renameGroupConversation(conversationId: string, name: string): Promise<void> {
    await this.db.query(
      'UPDATE conversations SET name = $1 WHERE id = $2',
      [name, conversationId],
    );
  }

  async addParticipant(conversationId: string, userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [conversationId, userId],
    );
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId],
    );
  }

  private async fetchWithParticipants(
    conv: ConversationRow,
    db: IDatabase = this.db,
  ): Promise<Conversation> {
    const { rows: participantRows } = await db.query<ParticipantRow>(
      `SELECT cp.conversation_id, cp.user_id, cp.last_read_at, u.display_name
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.conversation_id = $1`,
      [conv.id],
    );

    return {
      id: conv.id,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      participants: participantRows.map(rowToParticipant),
    };
  }
}
