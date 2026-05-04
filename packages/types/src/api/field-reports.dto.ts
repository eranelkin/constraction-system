import type { FieldReportWithReporter, FieldReportType, FieldReportStatus } from '../domain/FieldReport.js';

export interface ListFieldReportsResponse {
  reports: FieldReportWithReporter[];
  total: number;
}

export interface FieldReportResponse {
  report: FieldReportWithReporter;
}

export interface CreateFieldReportRequest {
  type: FieldReportType;
  project: string;
  location: string;
  description: string;
}

export interface UpdateFieldReportRequest {
  status?: FieldReportStatus;
  description?: string;
}
