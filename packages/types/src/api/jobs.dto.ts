import type { JobStatus, ApplicationStatus } from '../domain/Job.js';

export interface JobApplicationDetail {
  id: string;
  jobId: string;
  contractorId: string;
  contractorName: string;
  coverNote: string;
  status: ApplicationStatus;
  createdAt: Date;
}

export interface JobSummary {
  id: string;
  clientId: string;
  title: string;
  budget: number;
  location: string;
  status: JobStatus;
  applicationCount: number;
  createdAt: Date;
}

export interface JobDetail {
  id: string;
  clientId: string;
  title: string;
  description: string;
  budget: number;
  location: string;
  status: JobStatus;
  assignedContractorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  applications: JobApplicationDetail[];
}

export interface CreateJobRequest {
  title: string;
  description: string;
  budget: number;
  location: string;
}

export interface ApplyToJobRequest {
  coverNote: string;
}

export interface UpdateJobStatusRequest {
  status: 'completed' | 'cancelled';
}

export interface CreateJobResponse { job: JobDetail; }
export interface ListJobsResponse { jobs: JobSummary[]; }
export interface GetJobResponse { job: JobDetail; }
export interface ApplyToJobResponse { application: JobApplicationDetail; }
export interface HireContractorResponse { job: JobDetail; }
export interface MyJobsResponse { jobs: JobSummary[]; }
export interface MyApplicationsResponse {
  applications: Array<JobApplicationDetail & { jobTitle: string; jobStatus: JobStatus }>;
}
