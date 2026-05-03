import { Router } from 'express';
import type { AppContainer } from '../../container.js';

// This router is only mounted in non-production environments.
export function createDevRouter(container: AppContainer): Router {
  const router = Router();

  // POST /dev/clear-messages — wipes all messages and cascaded translations; leaves users/groups intact
  router.post('/clear-messages', async (_req, res, next) => {
    try {
      await container.db.query('DELETE FROM messages', []);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
