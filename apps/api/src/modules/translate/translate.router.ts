import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware } from '../auth/auth.middleware.js';
import { AppError } from '../../shared/errors.js';

export function createTranslateRouter(container: AppContainer): Router {
  const router = Router();
  const authenticate = createAuthMiddleware(container.authProvider);

  // POST /translate
  // Body: { text: string, targetLanguage?: string }
  // Returns: { translatedText: string }
  // If targetLanguage is omitted, uses the caller's language from the JWT.
  router.post('/', authenticate, async (req, res, next) => {
    try {
      const { text, targetLanguage } = req.body as { text?: string; targetLanguage?: string };

      if (!text || typeof text !== 'string' || !text.trim()) {
        throw new AppError('text is required', 400, 'MISSING_TEXT');
      }

      const target = targetLanguage ?? req.user!.language;

      const translatedText = await container.translationProvider.translate(text.trim(), target);
      res.json({ translatedText });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
