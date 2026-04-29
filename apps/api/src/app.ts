import express, { type Express } from 'express';
import cors from 'cors';
import { config } from '@constractor/config';
import type { AppContainer } from './container.js';
import { createAuthRouter } from './modules/auth/auth.router.js';
import { createMessagingRouter } from './modules/messaging/messaging.router.js';
import { createJobsRouter } from './modules/jobs/jobs.router.js';
import { createMyRouter } from './modules/jobs/my.router.js';
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
  app.use('/messaging', createMessagingRouter(container));
  app.use('/jobs', createJobsRouter(container));
  app.use('/my', createMyRouter(container));

  app.use(errorHandler);

  return app;
}
