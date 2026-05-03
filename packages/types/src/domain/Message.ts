export interface Conversation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  participants: ConversationParticipant[];
}

export interface ConversationParticipant {
  conversationId: string;
  userId: string;
  displayName: string;
  lastReadAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: Date;
  translatedBody?: string;
}
