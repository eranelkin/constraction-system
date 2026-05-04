import { z } from 'zod';

export const createScheduleTaskSchema = z.object({
  taskName:    z.string().min(1).max(300),
  project:     z.string().min(1).max(200),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  delayDays:   z.number().int().min(0),
  reason:      z.string().max(1000).optional(),
});

export const updateScheduleTaskSchema = z.object({
  status:    z.enum(['on-track', 'delayed', 'critical', 'complete']).optional(),
  delayDays: z.number().int().min(0).optional(),
  reason:    z.string().max(1000).nullable().optional(),
  impact:    z.string().max(1000).nullable().optional(),
});

export const listQuerySchema = z.object({
  status: z.enum(['on-track', 'delayed', 'critical', 'complete']).optional(),
});
