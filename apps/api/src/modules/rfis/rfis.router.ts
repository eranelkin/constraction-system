import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors.js';
import { createRfiSchema, updateRfiSchema, listQuerySchema } from './rfis.schema.js';

export function createRfisRouter(container: AppContainer): Router {
  const router = Router();
  const { rfiRepository } = container;
  const authenticate = createAuthMiddleware(container.authProvider);

  router.use(authenticate);

  // GET /rfis
  router.get('/', async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const filters: Parameters<typeof rfiRepository.list>[0] = {};
      if (query.status)   filters.status   = query.status;
      if (query.priority) filters.priority = query.priority;
      const rfis = await rfiRepository.list(filters);
      res.json({ rfis, total: rfis.length });
    } catch (err) { next(err); }
  });

  // GET /rfis/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const rfi = await rfiRepository.findById(req.params['id'] as string);
      if (!rfi) throw new NotFoundError('RFI');
      res.json({ rfi });
    } catch (err) { next(err); }
  });

  // POST /rfis — any authenticated user can create an RFI
  router.post('/', async (req, res, next) => {
    try {
      const data = createRfiSchema.parse(req.body);
      const rfi = await rfiRepository.create({
        title: data.title,
        description: data.description,
        priority: data.priority,
        createdBy: req.user!.id,
        ...(data.project    ? { project:    data.project }    : {}),
        ...(data.assignedTo ? { assignedTo: data.assignedTo } : {}),
        ...(data.dueDate    ? { dueDate:    data.dueDate }    : {}),
      });
      res.status(201).json({ rfi });
    } catch (err) { next(err); }
  });

  // PATCH /rfis/:id — update status, priority, response, etc.
  router.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const data = updateRfiSchema.parse(req.body);
      const updateData: Parameters<typeof rfiRepository.update>[1] = {};
      if (data.status     !== undefined) updateData.status     = data.status;
      if (data.priority   !== undefined) updateData.priority   = data.priority;
      if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
      if (data.dueDate    !== undefined) updateData.dueDate    = data.dueDate;
      if (data.response   !== undefined) updateData.response   = data.response;
      if (data.status === 'answered' || data.status === 'closed') updateData.resolvedAt = new Date();
      const rfi = await rfiRepository.update(id, updateData);
      if (!rfi) throw new NotFoundError('RFI');
      res.json({ rfi });
    } catch (err) { next(err); }
  });

  // DELETE /rfis/:id — admin only
  router.delete('/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const existing = await rfiRepository.findById(id);
      if (!existing) throw new NotFoundError('RFI');
      await rfiRepository.delete(id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
