import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { AppContainer } from '../../container.js';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from './auth.schema.js';
import { createAuthMiddleware } from './auth.middleware.js';

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

export function createAuthRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, userRepository } = container;
  const authenticate = createAuthMiddleware(authProvider);

  router.post('/register', strictLimiter, async (req, res, next) => {
    try {
      const body = registerSchema.parse(req.body);
      const result = await authProvider.signUp(body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', strictLimiter, async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const result = await authProvider.signIn(body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/refresh', refreshLimiter, async (req, res, next) => {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const tokens = await authProvider.refresh(refreshToken);
      res.json({ tokens });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const { refreshToken } = logoutSchema.parse(req.body);
      await authProvider.signOut(refreshToken);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  router.get('/users', authenticate, async (req, res, next) => {
    try {
      const users = await userRepository.listAll(req.user!.id);
      res.json({ users });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
