import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';

const patchSettingsSchema = z.object({
  videoMaxDurationSeconds: z.number().int().min(5).max(120).optional(),
  videoQuality: z.number().min(0.1).max(1.0).optional(),
});

export function createSettingsRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, db } = container;
  const authenticate = createAuthMiddleware(authProvider);

  router.use(authenticate);

  // GET /settings — all authenticated users
  router.get('/', async (_req, res, next) => {
    try {
      const { rows } = await db.query<{ key: string; value: string }>(
        'SELECT key, value FROM settings',
        [],
      );

      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      res.json({
        videoMaxDurationSeconds: parseInt(map['video_max_duration_seconds'] ?? '12', 10),
        videoQuality: parseFloat(map['video_quality'] ?? '0.4'),
      });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /settings — admin only
  router.patch('/', requireRole('admin'), async (req, res, next) => {
    try {
      const data = patchSettingsSchema.parse(req.body);

      if (data.videoMaxDurationSeconds !== undefined) {
        await db.query(
          `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          ['video_max_duration_seconds', String(data.videoMaxDurationSeconds)],
        );
      }

      if (data.videoQuality !== undefined) {
        await db.query(
          `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          ['video_quality', String(data.videoQuality)],
        );
      }

      const { rows } = await db.query<{ key: string; value: string }>(
        'SELECT key, value FROM settings',
        [],
      );
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      res.json({
        videoMaxDurationSeconds: parseInt(map['video_max_duration_seconds'] ?? '12', 10),
        videoQuality: parseFloat(map['video_quality'] ?? '0.4'),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
