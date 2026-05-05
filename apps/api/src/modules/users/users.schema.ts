import { z } from 'zod';

export const createUserSchema = z.object({
  displayName:   z.string().min(2).max(100),
  email:         z.string().email(),
  password:      z.string().min(8, 'Password must be at least 8 characters'),
  role:          z.enum(['admin', 'manager', 'member']),
  language:      z.string().max(10).default('en'),
  avatar:        z.string().optional(),      // base64
  avatarMimeType:z.string().optional(),
});

export const updateUserSchema = z.object({
  displayName:   z.string().min(2).max(100).optional(),
  email:         z.string().email().optional(),
  password:      z.string().min(8, 'Password must be at least 8 characters').optional(),
  role:          z.enum(['admin', 'manager', 'member']).optional(),
  language:      z.string().max(10).optional(),
  avatar:        z.string().nullable().optional(), // base64 | null to clear | omit to keep
  avatarMimeType:z.string().optional(),
  canSendVoice:  z.boolean().optional(),
  canSendVideo:  z.boolean().optional(),
});
