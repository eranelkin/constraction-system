import type { Message } from '@constractor/types';

export type { IMessageRepository };

interface IMessageRepository {
  create(conversationId: string, senderId: string, body: string): Promise<Message>;
  list(conversationId: string, afterId?: string): Promise<Message[]>;
}
