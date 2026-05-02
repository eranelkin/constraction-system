import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { ForbiddenError, NotFoundError, AppError } from '../../shared/errors.js';
import { createUserSchema, updateUserSchema } from './users.schema.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function createUsersRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, userRepository } = container;
  const authenticate = createAuthMiddleware(authProvider);

  // ── Public: serve avatar (no auth — profile pictures are not sensitive) ──

  router.get('/:id/avatar', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const avatar = await userRepository.getAvatar(id);
      if (!avatar) {
        res.status(404).json({ error: 'No avatar' });
        return;
      }
      res.setHeader('Content-Type', avatar.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(avatar.data);
    } catch (err) {
      next(err);
    }
  });

  // ── All routes below require admin or manager ─────────────────────────────

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

      const avatar = data.avatar ? parseAvatar(data.avatar, data.avatarMimeType) : undefined;

      const user = await userRepository.create({
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        language: data.language,
        passwordHash,
        ...(avatar && { avatarData: avatar.data, avatarMimeType: avatar.mimeType }),
      });

      const { passwordHash: _, ...publicUser } = user;
      res.status(201).json({ user: { ...publicUser, hasAvatar: avatar !== undefined } });
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
      if (data.email !== undefined)       updateData.email = data.email;
      if (data.role !== undefined)        updateData.role = data.role;
      if (data.language !== undefined)    updateData.language = data.language;
      if (data.password !== undefined)    updateData.passwordHash = await bcrypt.hash(data.password, 12);

      // avatar: null → clear, string → update, absent → no change
      if (data.avatar === null) {
        updateData.avatarData = null;
        updateData.avatarMimeType = null;
      } else if (typeof data.avatar === 'string') {
        const parsed = parseAvatar(data.avatar, data.avatarMimeType);
        updateData.avatarData = parsed.data;
        updateData.avatarMimeType = parsed.mimeType;
      }

      const updated = await userRepository.update(id, updateData);
      if (!updated) throw new NotFoundError('User');

      const { passwordHash: _, ...publicUser } = updated;
      const hasAvatar = updateData.avatarData !== undefined
        ? updateData.avatarData !== null
        : (await userRepository.getAvatar(id)) !== null;

      res.json({ user: { ...publicUser, hasAvatar } });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /users/:id/active — activate or deactivate a user
  router.patch('/:id/active', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const actor = req.user!;

      if (id === actor.id) throw new ForbiddenError('You cannot deactivate your own account');

      const target = await userRepository.findById(id);
      if (!target) throw new NotFoundError('User');

      if (target.role === 'admin' && actor.role !== 'admin') {
        throw new ForbiddenError('Managers cannot change active status of admin accounts');
      }

      const { isActive } = req.body as { isActive: boolean };
      if (typeof isActive !== 'boolean') {
        res.status(400).json({ error: 'isActive must be a boolean' });
        return;
      }

      const updated = await userRepository.update(id, { isActive });
      if (!updated) throw new NotFoundError('User');

      const { passwordHash: _, ...publicUser } = updated;
      const hasAvatar = (await userRepository.getAvatar(id)) !== null;
      res.json({ user: { ...publicUser, hasAvatar } });
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

function parseAvatar(base64: string, mimeType?: string): { data: Buffer; mimeType: string } {
  const resolvedMime = mimeType ?? 'image/jpeg';
  if (!ALLOWED_MIME.has(resolvedMime)) {
    throw new AppError(`Unsupported image type: ${resolvedMime}`, 400, 'INVALID_MIME');
  }
  const data = Buffer.from(base64, 'base64');
  if (data.byteLength > MAX_AVATAR_BYTES) {
    throw new AppError('Avatar image too large (max 2 MB)', 413, 'AVATAR_TOO_LARGE');
  }
  return { data, mimeType: resolvedMime };
}
