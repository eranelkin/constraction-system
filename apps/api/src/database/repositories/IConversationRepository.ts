import type { Conversation, ConversationSummary } from '@constractor/types';

export type { IConversationRepository };

interface IConversationRepository {
  findOrCreate(participantIds: [string, string]): Promise<Conversation>;
  findByUserId(userId: string): Promise<ConversationSummary[]>;
  findById(id: string): Promise<Conversation | null>;
  markRead(conversationId: string, userId: string): Promise<void>;
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
  createGroupConversation(participantIds: string[], name: string): Promise<Conversation>;
  renameGroupConversation(conversationId: string, name: string): Promise<void>;
  addParticipant(conversationId: string, userId: string): Promise<void>;
  removeParticipant(conversationId: string, userId: string): Promise<void>;
}
