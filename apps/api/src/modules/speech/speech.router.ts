import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware } from '../auth/auth.middleware.js';
import { AppError } from '../../shared/errors.js';

export function createSpeechRouter(container: AppContainer): Router {
  const router = Router();
  const authenticate = createAuthMiddleware(container.authProvider);

  // POST /speech/transcribe
  // Body: { audio: string (base64), mimeType: string }
  // Returns: { text: string }
  router.post('/transcribe', authenticate, async (req, res, next) => {
    try {
      const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };

      if (!audio || typeof audio !== 'string') {
        throw new AppError('audio (base64 string) is required', 400, 'MISSING_AUDIO');
      }
      if (!mimeType || typeof mimeType !== 'string') {
        throw new AppError('mimeType is required', 400, 'MISSING_MIME_TYPE');
      }

      const audioBuffer = Buffer.from(audio, 'base64');

      if (audioBuffer.byteLength > 10 * 1024 * 1024) {
        throw new AppError('Audio file too large (max 10 MB)', 413, 'AUDIO_TOO_LARGE');
      }

      const text = await container.speechProvider.transcribe(audioBuffer, mimeType);
      res.json({ text });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
