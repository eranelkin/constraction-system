import type { JobDetail, JobSummary, JobStatus, CreateJobRequest, JobApplicationDetail } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IJobRepository } from './IJobRepository.js';

interface JobRow {
  id: string;
  client_id: string;
  title: string;
  description: string;
  budget: string;
  location: string;
  status: JobStatus;
  assigned_contractor_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ApplicationDetailRow {
  id: string;
  job_id: string;
  contractor_id: string;
  contractor_name: string;
  cover_note: string;
  status: string;
  created_at: Date;
}

interface JobSummaryRow {
  id: string;
  client_id: string;
  title: string;
  budget: string;
  location: string;
  status: JobStatus;
  application_count: string;
  created_at: Date;
}

function rowToJobDetail(row: JobRow, applications: JobApplicationDetail[]): JobDetail {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description,
    budget: parseFloat(row.budget),
    location: row.location,
    status: row.status,
    assignedContractorId: row.assigned_contractor_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    applications,
  };
}

function rowToApplicationDetail(row: ApplicationDetailRow): JobApplicationDetail {
  return {
    id: row.id,
    jobId: row.job_id,
    contractorId: row.contractor_id,
    contractorName: row.contractor_name,
    coverNote: row.cover_note,
    status: row.status as JobApplicationDetail['status'],
    createdAt: row.created_at,
  };
}

function rowToJobSummary(row: JobSummaryRow): JobSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    budget: parseFloat(row.budget),
    location: row.location,
    status: row.status,
    applicationCount: parseInt(row.application_count, 10),
    createdAt: row.created_at,
  };
}

export class JobRepository implements IJobRepository {
  constructor(private readonly db: IDatabase) {}

  async create(clientId: string, data: CreateJobRequest): Promise<JobDetail> {
    const row = await this.db.queryOne<JobRow>(
      `INSERT INTO jobs (client_id, title, description, budget, location)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, title, description, budget, location, status,
                 assigned_contractor_id, created_at, updated_at`,
      [clientId, data.title, data.description, data.budget, data.location],
    );
    if (!row) throw new Error('Job creation failed');
    return rowToJobDetail(row, []);
  }

  async findById(id: string): Promise<JobDetail | null> {
    const row = await this.db.queryOne<JobRow>(
      `SELECT id, client_id, title, description, budget, location, status,
              assigned_contractor_id, created_at, updated_at
       FROM jobs WHERE id = $1`,
      [id],
    );
    if (!row) return null;

    const { rows: appRows } = await this.db.query<ApplicationDetailRow>(
      `SELECT ja.id, ja.job_id, ja.contractor_id, u.display_name AS contractor_name,
              ja.cover_note, ja.status, ja.created_at
       FROM job_applications ja
       JOIN users u ON u.id = ja.contractor_id
       WHERE ja.job_id = $1
       ORDER BY ja.created_at ASC`,
      [id],
    );

    return rowToJobDetail(row, appRows.map(rowToApplicationDetail));
  }

  async listOpen(): Promise<JobSummary[]> {
    const { rows } = await this.db.query<JobSummaryRow>(
      `SELECT j.id, j.client_id, j.title, j.budget, j.location, j.status, j.created_at,
              COUNT(ja.id)::text AS application_count
       FROM jobs j
       LEFT JOIN job_applications ja ON ja.job_id = j.id
       WHERE j.status = 'open'
       GROUP BY j.id
       ORDER BY j.created_at DESC`,
      [],
    );
    return rows.map(rowToJobSummary);
  }

  async listByClientId(clientId: string): Promise<JobSummary[]> {
    const { rows } = await this.db.query<JobSummaryRow>(
      `SELECT j.id, j.client_id, j.title, j.budget, j.location, j.status, j.created_at,
              COUNT(ja.id)::text AS application_count
       FROM jobs j
       LEFT JOIN job_applications ja ON ja.job_id = j.id
       WHERE j.client_id = $1
       GROUP BY j.id
       ORDER BY j.created_at DESC`,
      [clientId],
    );
    return rows.map(rowToJobSummary);
  }

  async updateStatus(id: string, status: JobStatus, assignedContractorId?: string): Promise<JobDetail | null> {
    let row: JobRow | null;

    if (assignedContractorId !== undefined) {
      row = await this.db.queryOne<JobRow>(
        `UPDATE jobs SET status = $2, assigned_contractor_id = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING id, client_id, title, description, budget, location, status,
                   assigned_contractor_id, created_at, updated_at`,
        [id, status, assignedContractorId],
      );
    } else {
      row = await this.db.queryOne<JobRow>(
        `UPDATE jobs SET status = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, client_id, title, description, budget, location, status,
                   assigned_contractor_id, created_at, updated_at`,
        [id, status],
      );
    }

    if (!row) return null;

    const { rows: appRows } = await this.db.query<ApplicationDetailRow>(
      `SELECT ja.id, ja.job_id, ja.contractor_id, u.display_name AS contractor_name,
              ja.cover_note, ja.status, ja.created_at
       FROM job_applications ja
       JOIN users u ON u.id = ja.contractor_id
       WHERE ja.job_id = $1
       ORDER BY ja.created_at ASC`,
      [id],
    );

    return rowToJobDetail(row, appRows.map(rowToApplicationDetail));
  }
}
