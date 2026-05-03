import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware } from '../auth/auth.middleware.js';
import { AppError } from '../../shared/errors.js';

export function createTranslateRouter(container: AppContainer): Router {
  const router = Router();
  const authenticate = createAuthMiddleware(container.authProvider);

  // POST /translate
  // Body: { text: string, targetLanguage?: string, messageId?: string }
  // Returns: { translatedText: string }
  // When messageId is provided, checks the translation cache before calling the provider
  // and stores the result for future calls.
  router.post('/', authenticate, async (req, res, next) => {
    try {
      const { text, targetLanguage, messageId } = req.body as {
        text?: string;
        targetLanguage?: string;
        messageId?: string;
      };

      if (!text || typeof text !== 'string' || !text.trim()) {
        throw new AppError('text is required', 400, 'MISSING_TEXT');
      }

      const target = targetLanguage ?? req.user!.language;
      const trimmedText = text.trim();

      if (messageId && typeof messageId === 'string') {
        const cached = await container.translationCacheRepository.get(messageId, target);
        if (cached) {
          res.json({ translatedText: cached });
          return;
        }
      }

      const translatedText = await container.translationProvider.translate(trimmedText, target);

      if (messageId && typeof messageId === 'string') {
        await container.translationCacheRepository.set(messageId, target, translatedText);
      }

      res.json({ translatedText });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
