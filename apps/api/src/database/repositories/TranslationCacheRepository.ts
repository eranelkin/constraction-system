import type { IDatabase } from '../DatabaseProvider.js';

export class TranslationCacheRepository {
  constructor(private readonly db: IDatabase) {}

  async get(messageId: string, language: string): Promise<string | null> {
    const row = await this.db.queryOne<{ translated_body: string }>(
      'SELECT translated_body FROM message_translations WHERE message_id = $1 AND language = $2',
      [messageId, language],
    );
    return row?.translated_body ?? null;
  }

  async set(messageId: string, language: string, translatedBody: string): Promise<void> {
    await this.db.query(
      `INSERT INTO message_translations (message_id, language, translated_body)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, language) DO NOTHING`,
      [messageId, language, translatedBody],
    );
  }

  async getMany(messageIds: string[], language: string): Promise<Map<string, string>> {
    if (messageIds.length === 0) return new Map();
    const { rows } = await this.db.query<{ message_id: string; translated_body: string }>(
      `SELECT message_id, translated_body
       FROM message_translations
       WHERE message_id = ANY($1) AND language = $2`,
      [messageIds, language],
    );
    return new Map(rows.map((r) => [r.message_id, r.translated_body]));
  }
}
