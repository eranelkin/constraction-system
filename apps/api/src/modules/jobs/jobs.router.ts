import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { AppError, NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ConversationRepository } from '../../database/repositories/ConversationRepository.js';
import { JobRepository } from '../../database/repositories/JobRepository.js';
import { JobApplicationRepository } from '../../database/repositories/JobApplicationRepository.js';
import { createJobSchema, applyToJobSchema, updateJobStatusSchema } from './jobs.schema.js';

export function createJobsRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, jobRepository, jobApplicationRepository, db } = container;
  const authenticate = createAuthMiddleware(authProvider);

  router.use(authenticate);

  router.post('/', requireRole('client'), async (req, res, next) => {
    try {
      const data = createJobSchema.parse(req.body);
      const job = await jobRepository.create(req.user!.id, data);
      res.status(201).json({ job });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const jobs = await jobRepository.listOpen();
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const job = await jobRepository.findById(id);
      if (!job) throw new NotFoundError('Job');

      const user = req.user!;
      if (user.role === 'contractor') {
        job.applications = job.applications.filter((a) => a.contractorId === user.id);
      }

      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireRole('client'), async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { status } = updateJobStatusSchema.parse(req.body);

      const existing = await jobRepository.findById(id);
      if (!existing) throw new NotFoundError('Job');
      if (existing.clientId !== req.user!.id) throw new ForbiddenError();

      if (status === 'completed' && existing.status !== 'assigned') {
        throw new ValidationError('Job must be assigned to mark as completed');
      }
      if (status === 'cancelled' && existing.status !== 'open') {
        throw new ValidationError('Only open jobs can be cancelled');
      }

      const updated = await jobRepository.updateStatus(id, status);
      if (!updated) throw new NotFoundError('Job');
      res.json({ job: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/apply', requireRole('contractor'), async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { coverNote } = applyToJobSchema.parse(req.body);

      const job = await jobRepository.findById(id);
      if (!job) throw new NotFoundError('Job');
      if (job.status !== 'open') {
        throw new ValidationError('Job is not open for applications');
      }

      try {
        const application = await jobApplicationRepository.create(id, req.user!.id, coverNote);
        res.status(201).json({ application });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === '23505'
        ) {
          throw new AppError('Already applied to this job', 409, 'DUPLICATE_APPLICATION');
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/hire/:applicantId', requireRole('client'), async (req, res, next) => {
    try {
      const { id, applicantId } = req.params as { id: string; applicantId: string };

      const job = await jobRepository.findById(id);
      if (!job) throw new NotFoundError('Job');
      if (job.clientId !== req.user!.id) throw new ForbiddenError();
      if (job.status !== 'open') {
        throw new ValidationError('Job is not open for hiring');
      }

      const applicationExists = job.applications.some((a) => a.id === applicantId);
      if (!applicationExists) throw new NotFoundError('Application');

      const updatedJob = await db.transaction(async (tx) => {
        const contractorId = await new JobApplicationRepository(tx).setHireOutcome(id, applicantId);
        const updated = await new JobRepository(tx).updateStatus(id, 'assigned', contractorId);
        if (!updated) throw new NotFoundError('Job');
        await new ConversationRepository(tx).findOrCreate([req.user!.id, contractorId]);
        return updated;
      });

      res.json({ job: updatedJob });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
