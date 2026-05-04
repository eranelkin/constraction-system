import type { FieldReportWithReporter, FieldReportType, FieldReportStatus, CreateFieldReportDTO, UpdateFieldReportDTO } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IFieldReportRepository } from './IFieldReportRepository.js';

interface FieldReportRow {
  id: string;
  type: FieldReportType;
  project: string;
  location: string;
  description: string;
  status: FieldReportStatus;
  reported_by: string;
  reporter_name: string;
  photo_base64: string | null;
  photo_mime_type: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToReport(row: FieldReportRow): FieldReportWithReporter {
  return {
    id: row.id,
    type: row.type,
    project: row.project,
    location: row.location,
    description: row.description,
    status: row.status,
    reportedBy: row.reported_by,
    reporterName: row.reporter_name,
    photoBase64: row.photo_base64,
    photoMimeType: row.photo_mime_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_QUERY = `
  SELECT fr.*, u.display_name AS reporter_name
  FROM field_reports fr
  JOIN users u ON u.id = fr.reported_by
`;

export class FieldReportRepository implements IFieldReportRepository {
  constructor(private readonly db: IDatabase) {}

  async list(filters?: { status?: FieldReportStatus; type?: FieldReportType }): Promise<FieldReportWithReporter[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (filters?.status) { conditions.push(`fr.status = $${i++}`); values.push(filters.status); }
    if (filters?.type)   { conditions.push(`fr.type = $${i++}`);   values.push(filters.type); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.db.query<FieldReportRow>(
      `${BASE_QUERY} ${where} ORDER BY fr.created_at DESC`,
      values,
    );
    return rows.map(rowToReport);
  }

  async findById(id: string): Promise<FieldReportWithReporter | null> {
    const row = await this.db.queryOne<FieldReportRow>(
      `${BASE_QUERY} WHERE fr.id = $1`,
      [id],
    );
    return row ? rowToReport(row) : null;
  }

  async create(data: CreateFieldReportDTO): Promise<FieldReportWithReporter> {
    const row = await this.db.queryOne<FieldReportRow>(
      `INSERT INTO field_reports (type, project, location, description, reported_by, photo_base64, photo_mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [data.type, data.project, data.location, data.description, data.reportedBy,
       data.photoBase64 ?? null, data.photoMimeType ?? null],
    );
    if (!row) throw new Error('Field report creation failed');
    const created = await this.findById(row.id);
    if (!created) throw new Error('Field report creation failed');
    return created;
  }

  async update(id: string, data: UpdateFieldReportDTO): Promise<FieldReportWithReporter | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.status      !== undefined) { fields.push(`status = $${i++}`);      values.push(data.status); }
    if (data.description !== undefined) { fields.push(`description = $${i++}`); values.push(data.description); }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.db.query(
      `UPDATE field_reports SET ${fields.join(', ')} WHERE id = $${i}`,
      values,
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM field_reports WHERE id = $1', [id]);
  }
}
