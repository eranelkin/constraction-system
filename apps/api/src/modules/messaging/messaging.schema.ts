import { z } from 'zod';

export const startConversationSchema = z.object({
  participantId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const messagesAfterSchema = z.object({
  after: z.string().uuid().optional(),
});
