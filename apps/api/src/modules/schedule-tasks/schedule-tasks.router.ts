import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors.js';
import { createScheduleTaskSchema, updateScheduleTaskSchema, listQuerySchema } from './schedule-tasks.schema.js';

export function createScheduleTasksRouter(container: AppContainer): Router {
  const router = Router();
  const { scheduleTaskRepository } = container;
  const authenticate = createAuthMiddleware(container.authProvider);

  router.use(authenticate, requireRole('admin', 'manager'));

  // GET /schedule-tasks
  router.get('/', async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const filters: Parameters<typeof scheduleTaskRepository.list>[0] = {};
      if (query.status) filters.status = query.status;
      const tasks = await scheduleTaskRepository.list(filters);
      res.json({ tasks, total: tasks.length });
    } catch (err) { next(err); }
  });

  // GET /schedule-tasks/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const task = await scheduleTaskRepository.findById(req.params['id'] as string);
      if (!task) throw new NotFoundError('Schedule task');
      res.json({ task });
    } catch (err) { next(err); }
  });

  // POST /schedule-tasks
  router.post('/', async (req, res, next) => {
    try {
      const data = createScheduleTaskSchema.parse(req.body);
      const createData: Parameters<typeof scheduleTaskRepository.create>[0] = {
        taskName: data.taskName,
        project: data.project,
        plannedDate: data.plannedDate,
        delayDays: data.delayDays,
        createdBy: req.user!.id,
      };
      if (data.reason !== undefined) createData.reason = data.reason;
      const task = await scheduleTaskRepository.create(createData);
      res.status(201).json({ task });
    } catch (err) { next(err); }
  });

  // PATCH /schedule-tasks/:id
  router.patch('/:id', async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const data = updateScheduleTaskSchema.parse(req.body);
      const updateData: Parameters<typeof scheduleTaskRepository.update>[1] = {};
      if (data.status    !== undefined) updateData.status    = data.status;
      if (data.delayDays !== undefined) updateData.delayDays = data.delayDays;
      if (data.reason    !== undefined) updateData.reason    = data.reason;
      if (data.impact    !== undefined) updateData.impact    = data.impact;
      const task = await scheduleTaskRepository.update(id, updateData);
      if (!task) throw new NotFoundError('Schedule task');
      res.json({ task });
    } catch (err) { next(err); }
  });

  // DELETE /schedule-tasks/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const existing = await scheduleTaskRepository.findById(id);
      if (!existing) throw new NotFoundError('Schedule task');
      await scheduleTaskRepository.delete(id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
