import type { FieldReportWithReporter, CreateFieldReportDTO, UpdateFieldReportDTO, FieldReportStatus, FieldReportType } from '@constractor/types';

export type { IFieldReportRepository };

interface IFieldReportRepository {
  list(filters?: { status?: FieldReportStatus; type?: FieldReportType }): Promise<FieldReportWithReporter[]>;
  findById(id: string): Promise<FieldReportWithReporter | null>;
  create(data: CreateFieldReportDTO): Promise<FieldReportWithReporter>;
  update(id: string, data: UpdateFieldReportDTO): Promise<FieldReportWithReporter | null>;
  delete(id: string): Promise<void>;
}
