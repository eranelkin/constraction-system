import type { AuthUser } from '@constractor/types';

const ACCESS_KEY = 'access_token';
const USER_KEY = 'auth_user';

export function saveSession(user: AuthUser, accessToken: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function updateAccessToken(accessToken: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ACCESS_KEY, accessToken);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(USER_KEY);
}
