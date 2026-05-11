import { mkdir, writeFile, access, unlink, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { IStorageProvider, UploadOptions, UploadResult, GetUrlOptions } from '@constractor/types';

export class LocalStorageProvider implements IStorageProvider {
  constructor(private readonly uploadDir: string) {}

  async upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    _options?: UploadOptions,
  ): Promise<UploadResult> {
    const filePath = join(this.uploadDir, key);
    await mkdir(dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await writeFile(filePath, data);
    } else {
      await pipeline(data, createWriteStream(filePath));
    }

    const sizeBytes = Buffer.isBuffer(data) ? data.length : 0;
    return {
      key,
      url: `/media/serve/${key}`,
      sizeBytes,
    };
  }

  async getUrl(key: string, _options?: GetUrlOptions): Promise<string> {
    return `/media/serve/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.uploadDir, key);
    await unlink(filePath);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = join(this.uploadDir, key);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createReadStream(key: string, options?: { start?: number; end?: number }): Promise<NodeJS.ReadableStream> {
    const filePath = join(this.uploadDir, key);
    await access(filePath);
    return createReadStream(filePath, options);
  }

  async getFileSize(key: string): Promise<number> {
    const filePath = join(this.uploadDir, key);
    const { size } = await stat(filePath);
    return size;
  }
}
