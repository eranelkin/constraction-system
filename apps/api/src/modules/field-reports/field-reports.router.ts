import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors.js';
import { createFieldReportSchema, updateFieldReportSchema, listQuerySchema } from './field-reports.schema.js';

export function createFieldReportsRouter(container: AppContainer): Router {
  const router = Router();
  const { fieldReportRepository, storageProvider, db } = container;
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

      let photoKey: string | undefined;
      let photoUrl: string | undefined;
      let photoMime: string | undefined;
      let photoSize = 0;
      if (data.photoBase64 !== undefined) {
        photoMime = data.photoMimeType ?? 'image/jpeg';
        const ext = photoMime === 'image/png' ? '.png' : photoMime === 'image/webp' ? '.webp' : '.jpg';
        photoKey = `field-reports/${randomUUID()}${ext}`;
        const buffer = Buffer.from(data.photoBase64, 'base64');
        photoSize = buffer.length;
        const result = await storageProvider.upload(photoKey, buffer, { contentType: photoMime });
        photoUrl = result.url;
      }

      const createData: Parameters<typeof fieldReportRepository.create>[0] = {
        type: data.type,
        project: data.project,
        location: data.location,
        description: data.description,
        reportedBy: req.user!.id,
      };
      if (photoUrl !== undefined) createData.photoUrl = photoUrl;
      if (data.videoUrl !== undefined) createData.videoUrl = data.videoUrl;
      const report = await fieldReportRepository.create(createData);

      // Register photo in media_files so the serve route can find and auth-check it
      if (photoKey && photoUrl && photoMime) {
        await db.query(
          `INSERT INTO media_files (storage_key, url, mime_type, size_bytes, uploaded_by, entity_type, entity_id)
           VALUES ($1, $2, $3, $4, $5, 'field_report', $6)
           ON CONFLICT (storage_key) DO NOTHING`,
          [photoKey, photoUrl, photoMime, photoSize, req.user!.id, report.id],
        );
      }
      // Tag pre-uploaded video so any authenticated user can view it
      if (data.videoUrl) {
        await db.query(
          `UPDATE media_files SET entity_type = 'field_report', entity_id = $1 WHERE url = $2`,
          [report.id, data.videoUrl],
        );
      }

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
