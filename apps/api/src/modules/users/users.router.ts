import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { ForbiddenError, NotFoundError, AppError } from '../../shared/errors.js';
import { createUserSchema, updateUserSchema } from './users.schema.js';

export function createUsersRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, userRepository } = container;
  const authenticate = createAuthMiddleware(authProvider);

  router.use(authenticate);
  router.use(requireRole('admin', 'manager'));

  // GET /users — list all users
  router.get('/', async (_req, res, next) => {
    try {
      const users = await userRepository.listAllFull();
      res.json({ users });
    } catch (err) {
      next(err);
    }
  });

  // POST /users — create user
  router.post('/', async (req, res, next) => {
    try {
      const data = createUserSchema.parse(req.body);
      const actor = req.user!;

      if (data.role === 'admin' && actor.role !== 'admin') {
        throw new ForbiddenError('Managers cannot create admin accounts');
      }

      const existing = await userRepository.findByEmail(data.email);
      if (existing) throw new AppError('Email already in use', 409, 'EMAIL_CONFLICT');

      const passwordHash = await bcrypt.hash(data.password, 12);
      const user = await userRepository.create({
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        passwordHash,
      });

      const { passwordHash: _, ...publicUser } = user;
      res.status(201).json({ user: publicUser });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /users/:id — update user
  router.patch('/:id', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const data = updateUserSchema.parse(req.body);
      const actor = req.user!;

      const target = await userRepository.findById(id);
      if (!target) throw new NotFoundError('User');

      if (target.role === 'admin' && actor.role !== 'admin') {
        throw new ForbiddenError('Managers cannot edit admin accounts');
      }
      if (data.role === 'admin' && actor.role !== 'admin') {
        throw new ForbiddenError('Managers cannot assign the admin role');
      }
      if (data.role !== undefined && id === actor.id) {
        throw new ForbiddenError('You cannot change your own role');
      }

      const updateData: Parameters<typeof userRepository.update>[1] = {};
      if (data.displayName !== undefined) updateData.displayName = data.displayName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.password !== undefined) {
        updateData.passwordHash = await bcrypt.hash(data.password, 12);
      }

      const updated = await userRepository.update(id, updateData);
      if (!updated) throw new NotFoundError('User');

      const { passwordHash: _, ...publicUser } = updated;
      res.json({ user: publicUser });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /users/:id — delete user
  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const actor = req.user!;

      if (id === actor.id) throw new ForbiddenError('You cannot delete your own account');

      const target = await userRepository.findById(id);
      if (!target) throw new NotFoundError('User');

      if (target.role === 'admin' && actor.role !== 'admin') {
        throw new ForbiddenError('Managers cannot delete admin accounts');
      }

      if (target.role === 'admin') {
        const adminCount = await userRepository.countByRole('admin');
        if (adminCount <= 1) throw new ForbiddenError('Cannot delete the last admin account');
      }

      await userRepository.delete(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
