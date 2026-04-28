import express, { type Express } from 'express';
import cors from 'cors';
import { config } from '@constractor/config';
import type { AppContainer } from './container.js';
import { createAuthRouter } from './modules/auth/auth.router.js';
import { errorHandler } from './shared/middleware/errorHandler.js';

export function createApp(container: AppContainer): Express {
  const app = express();

  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: process.env['npm_package_version'] ?? '0.0.1',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/auth', createAuthRouter(container));

  app.use(errorHandler);

  return app;
}
