export interface UploadOptions {
  contentType?: string;
  isPublic?: boolean;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
}

export interface GetUrlOptions {
  expiresInSeconds?: number;
}

export interface IStorageProvider {
  upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    options?: UploadOptions,
  ): Promise<UploadResult>;

  getUrl(key: string, options?: GetUrlOptions): Promise<string>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;
}
