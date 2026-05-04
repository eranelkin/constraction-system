import { z } from 'zod';

export const createFieldReportSchema = z.object({
  type:          z.enum(['progress', 'issue', 'delay', 'safety']),
  project:       z.string().min(1).max(200),
  location:      z.string().min(1).max(200),
  description:   z.string().min(1).max(2000),
  photoBase64:   z.string().optional(),
  photoMimeType: z.string().max(50).optional(),
});

export const updateFieldReportSchema = z.object({
  status:      z.enum(['open', 'acknowledged', 'resolved']).optional(),
  description: z.string().min(1).max(2000).optional(),
});

export const listQuerySchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
  type:   z.enum(['progress', 'issue', 'delay', 'safety']).optional(),
});
