import type { ScheduleTaskWithCreator, ScheduleTaskStatus } from '../domain/ScheduleTask.js';

export interface ListScheduleTasksResponse {
  tasks: ScheduleTaskWithCreator[];
  total: number;
}

export interface ScheduleTaskResponse {
  task: ScheduleTaskWithCreator;
}

export interface CreateScheduleTaskRequest {
  taskName: string;
  project: string;
  plannedDate: string;
  delayDays: number;
  reason?: string;
}

export interface UpdateScheduleTaskRequest {
  status?: ScheduleTaskStatus;
  delayDays?: number;
  reason?: string | null;
  impact?: string | null;
}
