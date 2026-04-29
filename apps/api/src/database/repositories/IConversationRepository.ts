import type { Conversation, ConversationSummary } from '@constractor/types';

export type { IConversationRepository };

interface IConversationRepository {
  findOrCreate(participantIds: [string, string]): Promise<Conversation>;
  findByUserId(userId: string): Promise<ConversationSummary[]>;
  findById(id: string): Promise<Conversation | null>;
  markRead(conversationId: string, userId: string): Promise<void>;
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
}
