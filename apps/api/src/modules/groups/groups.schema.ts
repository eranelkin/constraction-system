import { z } from 'zod';

export const createGroupSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color:       z.string().max(20).optional(),
  emoji:       z.string().max(10).optional(),
  memberIds:   z.array(z.string().uuid()).default([]),
});

export const updateGroupSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color:       z.string().max(20).nullable().optional(),
  emoji:       z.string().max(10).nullable().optional(),
});

export const setMembersSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

export const syncUserMembershipsSchema = z.object({
  groupIds: z.array(z.string().uuid()),
});
