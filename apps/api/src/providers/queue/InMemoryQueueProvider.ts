import { randomUUID } from 'node:crypto';
import type {
  IQueueProvider,
  JobPayload,
  JobOptions,
  JobResult,
  JobHandler,
} from '@constractor/types';

interface StoredJob {
  jobId: string;
  type: string;
  data: unknown;
  status: JobResult['status'];
  result?: unknown;
  error?: string;
  runAt: number;
}

export class InMemoryQueueProvider implements IQueueProvider {
  private jobs = new Map<string, StoredJob>();
  private handlers = new Map<string, JobHandler>();

  async addJob<T>(payload: JobPayload<T>, options?: JobOptions): Promise<string> {
    const jobId = randomUUID();
    const runAt = Date.now() + (options?.delayMs ?? 0);

    this.jobs.set(jobId, {
      jobId,
      type: payload.type,
      data: payload.data,
      status: 'queued',
      runAt,
    });

    setTimeout(() => this.runJob(jobId), options?.delayMs ?? 0);
    return jobId;
  }

  processJob<TPayload, TResult>(
    type: string,
    handler: JobHandler<TPayload, TResult>,
  ): void {
    this.handlers.set(type, handler as JobHandler);
  }

  async getJobStatus(jobId: string): Promise<JobResult> {
    const job = this.jobs.get(jobId);
    if (!job) return { jobId, status: 'failed', error: 'Job not found' };
    const out: JobResult = { jobId: job.jobId, status: job.status };
    if (job.result !== undefined) out.result = job.result;
    if (job.error !== undefined) out.error = job.error;
    return out;
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.status = 'failed';
      job.error = `No handler registered for job type: ${job.type}`;
      return;
    }

    job.status = 'processing';
    try {
      job.result = await handler(job.data);
      job.status = 'done';
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
    }
  }
}
