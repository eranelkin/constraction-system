import type { Message } from '../domain/Message.js';

export interface ConversationSummary {
  id: string;
  updatedAt: Date;
  participants: Array<{ userId: string; displayName: string; lastReadAt: Date }>;
  lastMessage: { body: string; createdAt: Date } | null;
}

export interface StartConversationRequest {
  participantId: string;
}

export interface StartConversationResponse {
  conversation: ConversationSummary;
}

export interface SendMessageRequest {
  body: string;
}

export interface SendMessageResponse {
  message: Message;
}

export interface ListMessagesResponse {
  messages: Message[];
}

export interface ListConversationsResponse {
  conversations: ConversationSummary[];
}
