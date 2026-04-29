import { z } from 'zod';

export const createJobSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  budget: z.number().positive(),
  location: z.string().min(1),
});

export const applyToJobSchema = z.object({
  coverNote: z.string().min(1).max(1000),
});

export const updateJobStatusSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
});
