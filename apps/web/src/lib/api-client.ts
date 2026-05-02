import { getRefreshToken, updateTokens, clearSession } from './auth/session';
import type { AuthTokens } from '@constractor/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4501';

interface RequestOptions extends Omit<RequestInit, 'body'> {
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

async function attemptRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearSession();
      return null;
    }

    const data = (await response.json()) as { tokens: AuthTokens };
    updateTokens(data.tokens);
    return data.tokens.accessToken;
  } catch {
    clearSession();
    return null;
  }
}

async function executeRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { body, token, ...init } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
  try {
    return await executeRequest<T>(path, options);
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
