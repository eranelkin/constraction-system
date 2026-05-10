export type FieldReportType   = 'progress' | 'issue' | 'delay' | 'safety';
export type FieldReportStatus = 'open' | 'acknowledged' | 'resolved';

export interface FieldReport {
  id: string;
  type: FieldReportType;
  project: string;
  location: string;
  description: string;
  status: FieldReportStatus;
  reportedBy: string;
  photoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldReportWithReporter extends FieldReport {
  reporterName: string;
}

export type CreateFieldReportDTO = {
  type: FieldReportType;
  project: string;
  location: string;
  description: string;
  reportedBy: string;
  photoUrl?: string;
};

export type UpdateFieldReportDTO = {
  status?: FieldReportStatus;
  description?: string;
};
