import type { RfiWithUsers, RfiPriority, RfiStatus, CreateRfiDTO, UpdateRfiDTO } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IRfiRepository } from './IRfiRepository.js';

interface RfiRow {
  id: string;
  number: number;
  title: string;
  description: string;
  project: string | null;
  priority: RfiPriority;
  status: RfiStatus;
  created_by: string;
  creator_name: string;
  assigned_to: string | null;
  assignee_name: string | null;
  due_date: Date | null;
  response: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToRfi(row: RfiRow): RfiWithUsers {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    project: row.project,
    priority: row.priority,
    status: row.status,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_name,
    dueDate: row.due_date ? row.due_date.toISOString().split('T')[0] as string : null,
    response: row.response,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_QUERY = `
  SELECT r.*,
    uc.display_name AS creator_name,
    ua.display_name AS assignee_name
  FROM rfis r
  JOIN users uc ON uc.id = r.created_by
  LEFT JOIN users ua ON ua.id = r.assigned_to
`;

export class RfiRepository implements IRfiRepository {
  constructor(private readonly db: IDatabase) {}

  async list(filters?: { status?: RfiStatus; priority?: RfiPriority }): Promise<RfiWithUsers[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (filters?.status)   { conditions.push(`r.status = $${i++}`);   values.push(filters.status); }
    if (filters?.priority) { conditions.push(`r.priority = $${i++}`); values.push(filters.priority); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.db.query<RfiRow>(
      `${BASE_QUERY} ${where} ORDER BY r.created_at DESC`,
      values,
    );
    return rows.map(rowToRfi);
  }

  async findById(id: string): Promise<RfiWithUsers | null> {
    const row = await this.db.queryOne<RfiRow>(
      `${BASE_QUERY} WHERE r.id = $1`,
      [id],
    );
    return row ? rowToRfi(row) : null;
  }

  async create(data: CreateRfiDTO): Promise<RfiWithUsers> {
    const row = await this.db.queryOne<{ id: string }>(
      `INSERT INTO rfis (title, description, project, priority, created_by, assigned_to, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.title,
        data.description,
        data.project ?? null,
        data.priority,
        data.createdBy,
        data.assignedTo ?? null,
        data.dueDate ?? null,
      ],
    );
    if (!row) throw new Error('RFI creation failed');
    const created = await this.findById(row.id);
    if (!created) throw new Error('RFI creation failed');
    return created;
  }

  async update(id: string, data: UpdateRfiDTO): Promise<RfiWithUsers | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.status     !== undefined) { fields.push(`status = $${i++}`);      values.push(data.status); }
    if (data.priority   !== undefined) { fields.push(`priority = $${i++}`);    values.push(data.priority); }
    if (data.assignedTo !== undefined) { fields.push(`assigned_to = $${i++}`); values.push(data.assignedTo); }
    if (data.dueDate    !== undefined) { fields.push(`due_date = $${i++}`);    values.push(data.dueDate); }
    if (data.response   !== undefined) { fields.push(`response = $${i++}`);    values.push(data.response); }
    if (data.resolvedAt !== undefined) { fields.push(`resolved_at = $${i++}`); values.push(data.resolvedAt); }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.db.query(
      `UPDATE rfis SET ${fields.join(', ')} WHERE id = $${i}`,
      values,
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM rfis WHERE id = $1', [id]);
  }
}
