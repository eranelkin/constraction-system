export interface JobPayload<T = unknown> {
  type: string;
  data: T;
}

export interface JobOptions {
  delayMs?: number;
  attempts?: number;
  priority?: number;
}

export type QueueJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface JobResult<T = unknown> {
  jobId: string;
  status: QueueJobStatus;
  result?: T;
  error?: string;
}

export type JobHandler<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
) => Promise<TResult>;

export interface IQueueProvider {
  addJob<T>(payload: JobPayload<T>, options?: JobOptions): Promise<string>;

  processJob<TPayload, TResult>(
    type: string,
    handler: JobHandler<TPayload, TResult>,
  ): void;

  getJobStatus(jobId: string): Promise<JobResult>;
}
