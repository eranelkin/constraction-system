import type { JobApplicationDetail, JobStatus } from '@constractor/types';

export type { IJobApplicationRepository };

interface IJobApplicationRepository {
  create(jobId: string, contractorId: string, coverNote: string): Promise<JobApplicationDetail>;
  findByContractorId(contractorId: string): Promise<Array<JobApplicationDetail & { jobTitle: string; jobStatus: JobStatus }>>;
  setHireOutcome(jobId: string, acceptedApplicationId: string): Promise<string>;
  existsByJobAndContractor(jobId: string, contractorId: string): Promise<boolean>;
}
