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

  // GET /media/serve/* — intentionally placed BEFORE router.use(authenticate) so it can
  // accept the token as a query-string parameter (?token=...) in addition to the
  // Authorization header.  Browser <video>/<audio> elements and iOS AVPlayer cannot
  // set custom headers, so they embed the JWT in the URL instead.
  router.get('/serve/*', async (req, res, next) => {
    try {
      const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const queryToken = typeof req.query['token'] === 'string' ? req.query['token'] : undefined;
      const token = headerToken ?? queryToken;

      if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const authResult = await authProvider.verify(token);
      if (!authResult.valid || !authResult.user) {
        res.status(401).json({ error: authResult.error ?? 'Invalid token' });
        return;
      }

      const userId = authResult.user.id;
      const storageKey = req.path.slice('/serve/'.length);
      if (!storageKey || storageKey.includes('..')) {
        res.status(400).json({ error: 'Invalid media path' });
        return;
      }

      const row = await db.queryOne<{ storage_key: string; mime_type: string }>(
        `SELECT mf.storage_key, mf.mime_type
         FROM media_files mf
         WHERE mf.storage_key = $1
           AND (
             mf.uploaded_by = $2
             OR mf.entity_type IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM messages m
               JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
               WHERE (m.audio_url = mf.url OR m.video_url = mf.url)
                 AND cp.user_id = $2
             )
           )`,
        [storageKey, userId],
      );

      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const stream = await storageProvider.createReadStream(row.storage_key);
      res.setHeader('Content-Type', row.mime_type);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      (stream as import('node:stream').Readable).pipe(res);
    } catch (err) {
      next(err);
    }
  });

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
        recipient_type: 'group' | 'direct' | null;
        group_id: string | null;
        group_name: string | null;
        group_emoji: string | null;
        recipient_user_id: string | null;
        recipient_user_name: string | null;
      }>(
        `SELECT
           mf.id, mf.storage_key, mf.url, mf.mime_type, mf.size_bytes,
           mf.duration_secs, mf.uploaded_by, mf.entity_type, mf.entity_id, mf.created_at,
           u.display_name AS uploader_name,
           CASE
             WHEN g.id IS NOT NULL THEN 'group'
             WHEN msg.conversation_id IS NOT NULL THEN 'direct'
             ELSE NULL
           END AS recipient_type,
           g.id   AS group_id,
           g.name AS group_name,
           g.emoji AS group_emoji,
           r.id           AS recipient_user_id,
           r.display_name AS recipient_user_name
         FROM media_files mf
         JOIN users u ON u.id = mf.uploaded_by
         LEFT JOIN LATERAL (
           SELECT conversation_id FROM messages
           WHERE video_url = mf.url OR audio_url = mf.url
           LIMIT 1
         ) msg ON true
         LEFT JOIN groups g ON g.conversation_id = msg.conversation_id
         LEFT JOIN LATERAL (
           SELECT cp.user_id FROM conversation_participants cp
           WHERE cp.conversation_id = msg.conversation_id
             AND cp.user_id != mf.uploaded_by
             AND g.id IS NULL
           LIMIT 1
         ) cp ON true
         LEFT JOIN users r ON r.id = cp.user_id
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
        recipientType: r.recipient_type,
        groupId: r.group_id,
        groupName: r.group_name,
        groupEmoji: r.group_emoji,
        recipientUserId: r.recipient_user_id,
        recipientUserName: r.recipient_user_name,
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
