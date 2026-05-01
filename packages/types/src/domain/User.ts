import type { UserRole } from '../providers/IAuthProvider.js';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  language: string;
  emailVerified: boolean;
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  language: string;
  emailVerified: boolean;
  createdAt: Date;
  hasAvatar: boolean;
}

export type CreateUserDTO = {
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  language: string;
  avatarData?: Buffer;
  avatarMimeType?: string;
};

export type UpdateUserDTO = {
  displayName?: string;
  email?: string;
  passwordHash?: string;
  role?: UserRole;
  language?: string;
  emailVerified?: boolean;
  avatarData?: Buffer | null;
  avatarMimeType?: string | null;
};
