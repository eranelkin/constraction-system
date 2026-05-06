import { Router } from 'express';
import { z } from 'zod';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware } from '../auth/auth.middleware.js';

const extractFieldsSchema = z.object({
  text: z.string().min(1).max(2000),
  fields: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        description: z.string().min(1).max(256),
        type: z.enum(['string', 'enum']),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export function createAIRouter(container: AppContainer): Router {
  const router = Router();
  const authenticate = createAuthMiddleware(container.authProvider);

  router.post('/extract-fields', authenticate, async (req, res, next) => {
    try {
      const { text, fields } = extractFieldsSchema.parse(req.body);
      const cleanFields = fields.map((f) => {
        if (f.options !== undefined) return { ...f, options: f.options };
        const { options: _options, ...rest } = f;
        return rest;
      });
      const extracted = await container.fieldExtractionProvider.extractFields(text, cleanFields, req.user!.language);
      res.json(extracted);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
