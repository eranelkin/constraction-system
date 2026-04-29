import type { JobDetail, JobSummary, JobStatus, CreateJobRequest } from '@constractor/types';

export type { IJobRepository };

interface IJobRepository {
  create(clientId: string, data: CreateJobRequest): Promise<JobDetail>;
  findById(id: string): Promise<JobDetail | null>;
  listOpen(): Promise<JobSummary[]>;
  listByClientId(clientId: string): Promise<JobSummary[]>;
  updateStatus(id: string, status: JobStatus, assignedContractorId?: string): Promise<JobDetail | null>;
}
