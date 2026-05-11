import * as FileSystem from 'expo-file-system';
import type { AuthTokens } from '@constractor/types';
import { getAccessToken, getRefreshToken, updateTokens, clearSession } from './auth/token-storage';

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

// Singleton promise to prevent concurrent refresh races: if two requests 401 at the
// same time, only one refresh call is made and both waiters get the same result.
let refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;

      let response: Response;
      try {
        response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Network error — session may still be valid, do not wipe it
        return null;
      }

      if (!response.ok) {
        // Only a 401 from the refresh endpoint is a confirmed dead session
        if (response.status === 401) await clearSession();
        return null;
      }

      const data = (await response.json()) as { tokens: AuthTokens };
      await updateTokens(data.tokens);
      return data.tokens.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function executeRequest<T>(path: string, options: RequestOptions): Promise<T> {
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

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // Always read the freshest token from storage so callers never pass a stale value
  const token = options.token ?? (await getAccessToken()) ?? undefined;
  try {
    return await executeRequest<T>(path, { ...options, token });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) {
      const newToken = await attemptRefresh();
      if (newToken) {
        return executeRequest<T>(path, { ...options, token: newToken });
      }
    }
    throw err;
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
