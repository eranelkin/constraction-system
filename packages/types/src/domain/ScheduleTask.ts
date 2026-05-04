export type ScheduleTaskStatus = 'on-track' | 'delayed' | 'critical' | 'complete';

export interface ScheduleTask {
  id: string;
  taskName: string;
  project: string;
  plannedDate: string;
  delayDays: number;
  status: ScheduleTaskStatus;
  reason: string | null;
  impact: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleTaskWithCreator extends ScheduleTask {
  creatorName: string;
}

export type CreateScheduleTaskDTO = {
  taskName: string;
  project: string;
  plannedDate: string;
  delayDays: number;
  reason?: string;
  createdBy: string;
};

export type UpdateScheduleTaskDTO = {
  status?: ScheduleTaskStatus;
  delayDays?: number;
  reason?: string | null;
  impact?: string | null;
};
