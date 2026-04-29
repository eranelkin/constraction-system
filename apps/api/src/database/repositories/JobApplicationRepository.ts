import type { JobApplicationDetail, JobStatus } from '@constractor/types';
import type { IDatabase } from '../DatabaseProvider.js';
import type { IJobApplicationRepository } from './IJobApplicationRepository.js';

interface ApplicationDetailRow {
  id: string;
  job_id: string;
  contractor_id: string;
  contractor_name: string;
  cover_note: string;
  status: string;
  created_at: Date;
}

interface ApplicationWithJobRow extends ApplicationDetailRow {
  job_title: string;
  job_status: JobStatus;
}

function rowToDetail(row: ApplicationDetailRow): JobApplicationDetail {
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

export class JobApplicationRepository implements IJobApplicationRepository {
  constructor(private readonly db: IDatabase) {}

  async create(jobId: string, contractorId: string, coverNote: string): Promise<JobApplicationDetail> {
    const row = await this.db.queryOne<ApplicationDetailRow>(
      `WITH inserted AS (
         INSERT INTO job_applications (job_id, contractor_id, cover_note)
         VALUES ($1, $2, $3)
         RETURNING id, job_id, contractor_id, cover_note, status, created_at
       )
       SELECT i.id, i.job_id, i.contractor_id, u.display_name AS contractor_name,
              i.cover_note, i.status, i.created_at
       FROM inserted i
       JOIN users u ON u.id = i.contractor_id`,
      [jobId, contractorId, coverNote],
    );
    if (!row) throw new Error('Application creation failed');
    return rowToDetail(row);
  }

  async findByContractorId(
    contractorId: string,
  ): Promise<Array<JobApplicationDetail & { jobTitle: string; jobStatus: JobStatus }>> {
    const { rows } = await this.db.query<ApplicationWithJobRow>(
      `SELECT ja.id, ja.job_id, ja.contractor_id, u.display_name AS contractor_name,
              ja.cover_note, ja.status, ja.created_at,
              j.title AS job_title, j.status AS job_status
       FROM job_applications ja
       JOIN users u ON u.id = ja.contractor_id
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.contractor_id = $1
       ORDER BY ja.created_at DESC`,
      [contractorId],
    );

    return rows.map((row) => ({
      ...rowToDetail(row),
      jobTitle: row.job_title,
      jobStatus: row.job_status,
    }));
  }

  async setHireOutcome(jobId: string, acceptedApplicationId: string): Promise<string> {
    const accepted = await this.db.queryOne<{ contractor_id: string }>(
      `UPDATE job_applications SET status = 'accepted'
       WHERE id = $1 AND job_id = $2
       RETURNING contractor_id`,
      [acceptedApplicationId, jobId],
    );
    if (!accepted) throw new Error('Application not found');

    await this.db.query(
      `UPDATE job_applications SET status = 'rejected'
       WHERE job_id = $1 AND id != $2`,
      [jobId, acceptedApplicationId],
    );

    return accepted.contractor_id;
  }

  async existsByJobAndContractor(jobId: string, contractorId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM job_applications WHERE job_id = $1 AND contractor_id = $2',
      [jobId, contractorId],
    );
    return row !== null;
  }
}
