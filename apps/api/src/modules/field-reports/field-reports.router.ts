import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors.js';
import { createFieldReportSchema, updateFieldReportSchema, listQuerySchema } from './field-reports.schema.js';

export function createFieldReportsRouter(container: AppContainer): Router {
  const router = Router();
  const { fieldReportRepository } = container;
  const authenticate = createAuthMiddleware(container.authProvider);

  router.use(authenticate);

  // GET /field-reports
  router.get('/', async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const filters: Parameters<typeof fieldReportRepository.list>[0] = {};
      if (query.status) filters.status = query.status;
      if (query.type)   filters.type   = query.type;
      const reports = await fieldReportRepository.list(filters);
      res.json({ reports, total: reports.length });
    } catch (err) { next(err); }
  });

  // GET /field-reports/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const report = await fieldReportRepository.findById(req.params['id'] as string);
      if (!report) throw new NotFoundError('Field report');
      res.json({ report });
    } catch (err) { next(err); }
  });

  // POST /field-reports
  router.post('/', async (req, res, next) => {
    try {
      const data = createFieldReportSchema.parse(req.body);
      const createData: Parameters<typeof fieldReportRepository.create>[0] = {
        type: data.type,
        project: data.project,
        location: data.location,
        description: data.description,
        reportedBy: req.user!.id,
      };
      if (data.photoBase64   !== undefined) createData.photoBase64   = data.photoBase64;
      if (data.photoMimeType !== undefined) createData.photoMimeType = data.photoMimeType;
      const report = await fieldReportRepository.create(createData);
      res.status(201).json({ report });
    } catch (err) { next(err); }
  });

  // PATCH /field-reports/:id — status updates (admin/manager only)
  router.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const data = updateFieldReportSchema.parse(req.body);
      const updateData: Parameters<typeof fieldReportRepository.update>[1] = {};
      if (data.status      !== undefined) updateData.status      = data.status;
      if (data.description !== undefined) updateData.description = data.description;
      const report = await fieldReportRepository.update(id, updateData);
      if (!report) throw new NotFoundError('Field report');
      res.json({ report });
    } catch (err) { next(err); }
  });

  // DELETE /field-reports/:id — admin only
  router.delete('/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const existing = await fieldReportRepository.findById(id);
      if (!existing) throw new NotFoundError('Field report');
      await fieldReportRepository.delete(id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
