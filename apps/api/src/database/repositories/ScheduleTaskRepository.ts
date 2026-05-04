import type { ScheduleTaskWithCreator, ScheduleTaskStatus, CreateScheduleTaskDTO, UpdateScheduleTaskDTO } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IScheduleTaskRepository } from './IScheduleTaskRepository.js';

interface ScheduleTaskRow {
  id: string;
  task_name: string;
  project: string;
  planned_date: Date;
  delay_days: number;
  status: ScheduleTaskStatus;
  reason: string | null;
  impact: string | null;
  created_by: string;
  creator_name: string;
  created_at: Date;
  updated_at: Date;
}

function rowToTask(row: ScheduleTaskRow): ScheduleTaskWithCreator {
  return {
    id: row.id,
    taskName: row.task_name,
    project: row.project,
    plannedDate: row.planned_date.toISOString().split('T')[0] as string,
    delayDays: row.delay_days,
    status: row.status,
    reason: row.reason,
    impact: row.impact,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_QUERY = `
  SELECT st.*, u.display_name AS creator_name
  FROM schedule_tasks st
  JOIN users u ON u.id = st.created_by
`;

export class ScheduleTaskRepository implements IScheduleTaskRepository {
  constructor(private readonly db: IDatabase) {}

  async list(filters?: { status?: ScheduleTaskStatus }): Promise<ScheduleTaskWithCreator[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (filters?.status) { conditions.push(`st.status = $${i++}`); values.push(filters.status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.db.query<ScheduleTaskRow>(
      `${BASE_QUERY} ${where} ORDER BY st.created_at DESC`,
      values,
    );
    return rows.map(rowToTask);
  }

  async findById(id: string): Promise<ScheduleTaskWithCreator | null> {
    const row = await this.db.queryOne<ScheduleTaskRow>(
      `${BASE_QUERY} WHERE st.id = $1`,
      [id],
    );
    return row ? rowToTask(row) : null;
  }

  async create(data: CreateScheduleTaskDTO): Promise<ScheduleTaskWithCreator> {
    const row = await this.db.queryOne<{ id: string }>(
      `INSERT INTO schedule_tasks (task_name, project, planned_date, delay_days, status, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.taskName,
        data.project,
        data.plannedDate,
        data.delayDays,
        data.delayDays >= 5 ? 'critical' : data.delayDays > 0 ? 'delayed' : 'on-track',
        data.reason ?? null,
        data.createdBy,
      ],
    );
    if (!row) throw new Error('Schedule task creation failed');
    const created = await this.findById(row.id);
    if (!created) throw new Error('Schedule task creation failed');
    return created;
  }

  async update(id: string, data: UpdateScheduleTaskDTO): Promise<ScheduleTaskWithCreator | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.status    !== undefined) { fields.push(`status = $${i++}`);    values.push(data.status); }
    if (data.delayDays !== undefined) { fields.push(`delay_days = $${i++}`); values.push(data.delayDays); }
    if (data.reason    !== undefined) { fields.push(`reason = $${i++}`);    values.push(data.reason); }
    if (data.impact    !== undefined) { fields.push(`impact = $${i++}`);    values.push(data.impact); }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.db.query(
      `UPDATE schedule_tasks SET ${fields.join(', ')} WHERE id = $${i}`,
      values,
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM schedule_tasks WHERE id = $1', [id]);
  }
}
