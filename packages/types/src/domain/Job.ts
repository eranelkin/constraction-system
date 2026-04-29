export type JobStatus = 'open' | 'assigned' | 'completed' | 'cancelled';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface Job {
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
}

export interface JobApplication {
  id: string;
  jobId: string;
  contractorId: string;
  coverNote: string;
  status: ApplicationStatus;
  createdAt: Date;
}
