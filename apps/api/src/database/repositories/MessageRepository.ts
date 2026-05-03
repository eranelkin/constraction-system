import type { Message } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IMessageRepository, ListOptions } from './IMessageRepository.js';
import type { TranslationCacheRepository } from './TranslationCacheRepository.js';

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: Date;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

const BASE_SELECT = `
  SELECT m.id, m.conversation_id, m.sender_id, u.display_name AS sender_name, m.body, m.created_at
  FROM messages m
  JOIN users u ON u.id = m.sender_id
`;

export class MessageRepository implements IMessageRepository {
  constructor(
    private readonly db: IDatabase,
    private readonly translationCache: TranslationCacheRepository,
  ) {}

  async create(conversationId: string, senderId: string, body: string): Promise<Message> {
    const row = await this.db.queryOne<MessageRow>(
      `WITH inserted AS (
         INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING *
       )
       SELECT i.id, i.conversation_id, i.sender_id, u.display_name AS sender_name, i.body, i.created_at
       FROM inserted i
       JOIN users u ON u.id = i.sender_id`,
      [conversationId, senderId, body],
    );
    if (!row) throw new Error('Message creation failed');
    return rowToMessage(row);
  }

  async list(conversationId: string, options: ListOptions = {}): Promise<Message[]> {
    const { beforeId, afterId, limit = 50, language } = options;
    let rows: MessageRow[];

    if (afterId) {
      ({ rows } = await this.db.query<MessageRow>(
        `${BASE_SELECT}
         WHERE m.conversation_id = $1
           AND m.created_at > (SELECT created_at FROM messages WHERE id = $2)
         ORDER BY m.created_at ASC
         LIMIT $3`,
        [conversationId, afterId, limit],
      ));
    } else if (beforeId) {
      ({ rows } = await this.db.query<MessageRow>(
        `SELECT sub.id, sub.conversation_id, sub.sender_id, sub.sender_name, sub.body, sub.created_at
         FROM (
           ${BASE_SELECT}
           WHERE m.conversation_id = $1
             AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)
           ORDER BY m.created_at DESC
           LIMIT $3
         ) sub
         ORDER BY sub.created_at ASC`,
        [conversationId, beforeId, limit],
      ));
    } else {
      ({ rows } = await this.db.query<MessageRow>(
        `SELECT sub.id, sub.conversation_id, sub.sender_id, sub.sender_name, sub.body, sub.created_at
         FROM (
           ${BASE_SELECT}
           WHERE m.conversation_id = $1
           ORDER BY m.created_at DESC
           LIMIT $2
         ) sub
         ORDER BY sub.created_at ASC`,
        [conversationId, limit],
      ));
    }

    const messages = rows.map(rowToMessage);

    if (language) {
      const translationMap = await this.translationCache.getMany(
        messages.map((m) => m.id),
        language,
      );
      for (const msg of messages) {
        const t = translationMap.get(msg.id);
        if (t !== undefined) msg.translatedBody = t;
      }
    }

    return messages;
  }
}
