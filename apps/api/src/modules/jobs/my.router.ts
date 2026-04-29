import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware } from '../auth/auth.middleware.js';

export function createMyRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, jobRepository, jobApplicationRepository } = container;
  const authenticate = createAuthMiddleware(authProvider);

  router.use(authenticate);

  router.get('/jobs', async (req, res, next) => {
    try {
      if (req.user!.role !== 'client') {
        res.json({ jobs: [] });
        return;
      }
      const jobs = await jobRepository.listByClientId(req.user!.id);
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  });

  router.get('/applications', async (req, res, next) => {
    try {
      if (req.user!.role !== 'contractor') {
        res.json({ applications: [] });
        return;
      }
      const applications = await jobApplicationRepository.findByContractorId(req.user!.id);
      res.json({ applications });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
