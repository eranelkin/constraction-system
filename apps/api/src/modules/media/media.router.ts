import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { AppError } from '../../shared/errors.js';

const ALLOWED_MIME_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/wav',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export function createMediaRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, storageProvider, db } = container;
  const authenticate = createAuthMiddleware(authProvider);

  router.use(authenticate);

  // POST /media/upload — any authenticated user
  router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);

      const mimeType = req.file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new AppError(`Unsupported file type: ${mimeType}`, 415);
      }

      const ext = extname(req.file.originalname) || mimeTypeToExt(mimeType);
      const key = `media/${randomUUID()}${ext}`;

      const result = await storageProvider.upload(key, req.file.buffer, { contentType: mimeType });

      const row = await db.queryOne<{ id: string }>(
        `INSERT INTO media_files (storage_key, url, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [key, result.url, mimeType, req.file.size, req.user!.id],
      );

      res.status(201).json({ url: result.url, mediaFileId: row!.id });
    } catch (err) {
      next(err);
    }
  });

  // GET /media/files — admin only
  router.get('/files', requireRole('admin'), async (_req, res, next) => {
    try {
      const { rows } = await db.query<{
        id: string;
        storage_key: string;
        url: string;
        mime_type: string;
        size_bytes: number | null;
        duration_secs: number | null;
        uploaded_by: string;
        uploader_name: string;
        entity_type: string | null;
        entity_id: string | null;
        created_at: Date;
      }>(
        `SELECT mf.*, u.display_name AS uploader_name
         FROM media_files mf
         JOIN users u ON u.id = mf.uploaded_by
         ORDER BY mf.created_at DESC`,
        [],
      );

      const files = rows.map((r) => ({
        id: r.id,
        storageKey: r.storage_key,
        url: r.url,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        durationSecs: r.duration_secs,
        uploadedBy: r.uploaded_by,
        uploaderName: r.uploader_name,
        entityType: r.entity_type,
        entityId: r.entity_id,
        createdAt: r.created_at,
      }));

      res.json({ files });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /media/files — bulk delete (admin only); must be before /:id route
  router.delete('/files', requireRole('admin'), async (req, res, next) => {
    try {
      const { ids } = req.body as { ids: unknown };
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('ids must be a non-empty array', 400);
      }
      const { rows } = await db.query<{ storage_key: string }>(
        'SELECT storage_key FROM media_files WHERE id = ANY($1)',
        [ids],
      );
      await Promise.all(rows.map((r) => storageProvider.delete(r.storage_key)));
      await db.query('DELETE FROM media_files WHERE id = ANY($1)', [ids]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // DELETE /media/files/:id — admin only
  router.delete('/files/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const row = await db.queryOne<{ storage_key: string }>(
        'SELECT storage_key FROM media_files WHERE id = $1',
        [id],
      );
      if (!row) {
        res.status(404).json({ error: 'Media file not found' });
        return;
      }

      await storageProvider.delete(row.storage_key);
      await db.query('DELETE FROM media_files WHERE id = $1', [id]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Catch multer errors (file too large, unexpected field, etc.) — these bypass the route
  // handler's try/catch because multer calls next(err) before the async handler runs.
  router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 50 MB)' : `Upload error: ${err.message}`;
      next(new AppError(message, 400));
      return;
    }
    next(err);
  });

  return router;
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/m4a': '.m4a',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/aac': '.aac',
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
  };
  return map[mimeType] ?? '';
}
