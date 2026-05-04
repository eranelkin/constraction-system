import { z } from 'zod';

export const createRfiSchema = z.object({
  title:       z.string().min(1).max(300),
  description: z.string().min(1).max(3000),
  project:     z.string().max(200).optional(),
  priority:    z.enum(['low', 'medium', 'high', 'critical']),
  assignedTo:  z.string().uuid().optional(),
  dueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
});

export const updateRfiSchema = z.object({
  status:     z.enum(['open', 'in-review', 'answered', 'closed']).optional(),
  priority:   z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  response:   z.string().max(5000).nullable().optional(),
});

export const listQuerySchema = z.object({
  status:   z.enum(['open', 'in-review', 'answered', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});
