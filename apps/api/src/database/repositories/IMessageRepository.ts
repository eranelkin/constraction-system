import type { Message } from '@constractor/types';

export type { IMessageRepository };
export type { ListOptions };

interface ListOptions {
  beforeId?: string;
  afterId?: string;
  limit?: number;
  language?: string;
}

interface IMessageRepository {
  create(conversationId: string, senderId: string, body: string): Promise<Message>;
  list(conversationId: string, options?: ListOptions): Promise<Message[]>;
}
