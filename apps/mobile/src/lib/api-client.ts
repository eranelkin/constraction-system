import * as FileSystem from 'expo-file-system';

export const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4501';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
}

interface ApiError {
  error: string;
  code?: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.error);
  }
}

export async function uploadFile(
  uri: string,
  mimeType: string,
  token: string,
): Promise<{ url: string; mediaFileId: string }> {
  // FileSystem.uploadAsync handles both file:// and content:// URIs (Android ImagePicker
  // returns content:// which React Native's fetch+FormData cannot read directly)
  const result = await FileSystem.uploadAsync(`${API_URL}/media/upload`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (result.status < 200 || result.status >= 300) {
    const errorBody = (JSON.parse(result.body) as ApiError | null) ?? { error: 'Upload failed' };
    throw new ApiRequestError(result.status, errorBody);
  }

  return JSON.parse(result.body) as { url: string; mediaFileId: string };
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, token, method = 'GET' } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({ error: 'Unknown error' }))) as ApiError;
    throw new ApiRequestError(response.status, errorBody);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
