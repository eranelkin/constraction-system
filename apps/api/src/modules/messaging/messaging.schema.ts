import { z } from 'zod';

export const startConversationSchema = z.object({
  participantId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  body: z.string().max(4000).default(''),
  audioUrl: z.string().min(1).optional(),
  videoUrl: z.string().min(1).optional(),
}).refine(
  (d) => d.body.length > 0 || d.audioUrl !== undefined || d.videoUrl !== undefined,
  { message: 'Message must have a body, audioUrl, or videoUrl' },
);

export const messagesQuerySchema = z.object({
  after:  z.string().uuid().optional(),
  before: z.string().uuid().optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
});
