import type { Request, Response, NextFunction } from 'express';
import type { IAuthProvider, AuthUser, UserRole } from '@constractor/types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function createAuthMiddleware(authProvider: IAuthProvider) {
  return async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header', code: 'UNAUTHORIZED' });
      return;
    }

    const token = authHeader.slice(7);
    const result = await authProvider.verify(token);

    if (!result.valid || !result.user) {
      res.status(401).json({ error: result.error ?? 'Invalid token', code: 'UNAUTHORIZED' });
      return;
    }

    req.user = result.user;
    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}
