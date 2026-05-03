import { z } from 'zod';

export const startConversationSchema = z.object({
  participantId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const messagesQuerySchema = z.object({
  after:  z.string().uuid().optional(),
  before: z.string().uuid().optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
});
