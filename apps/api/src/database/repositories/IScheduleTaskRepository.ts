import type { ScheduleTaskWithCreator, CreateScheduleTaskDTO, UpdateScheduleTaskDTO, ScheduleTaskStatus } from '@constractor/types';

export type { IScheduleTaskRepository };

interface IScheduleTaskRepository {
  list(filters?: { status?: ScheduleTaskStatus }): Promise<ScheduleTaskWithCreator[]>;
  findById(id: string): Promise<ScheduleTaskWithCreator | null>;
  create(data: CreateScheduleTaskDTO): Promise<ScheduleTaskWithCreator>;
  update(id: string, data: UpdateScheduleTaskDTO): Promise<ScheduleTaskWithCreator | null>;
  delete(id: string): Promise<void>;
}
