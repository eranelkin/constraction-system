import { updateAccessToken, clearSession } from './auth/session';

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

let refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        clearSession();
        return null;
      }

      const data = (await response.json()) as { tokens: { accessToken: string } };
      updateAccessToken(data.tokens.accessToken);
      return data.tokens.accessToken;
    } catch {
      clearSession();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
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
