import type { AuthTokens, AuthUser, UserRole } from '../providers/IAuthProvider.js';

export interface RegisterRequestDTO {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

export interface LoginRequestDTO {
  email: string;
  password: string;
}

export interface RefreshRequestDTO {
  refreshToken: string;
}

export interface LogoutRequestDTO {
  refreshToken: string;
}

export interface AuthResponseDTO {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RefreshResponseDTO {
  tokens: AuthTokens;
}

export interface MeResponseDTO {
  user: AuthUser;
}
