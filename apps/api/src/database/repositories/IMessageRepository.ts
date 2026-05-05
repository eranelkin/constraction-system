import type { Message } from '@constractor/types';

export type { IMessageRepository };
export type { ListOptions };
export type { CreateMessageOptions };

interface ListOptions {
  beforeId?: string;
  afterId?: string;
  limit?: number;
  language?: string;
}

interface CreateMessageOptions {
  audioUrl?: string;
  videoUrl?: string;
}

interface IMessageRepository {
  create(conversationId: string, senderId: string, body: string, options?: CreateMessageOptions): Promise<Message>;
  list(conversationId: string, options?: ListOptions): Promise<Message[]>;
}
