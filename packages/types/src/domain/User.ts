import type { UserRole } from '../providers/IAuthProvider.js';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
}

export type CreateUserDTO = Omit<User, 'id' | 'createdAt' | 'emailVerified'>;

export type UpdateUserDTO = Partial<Pick<User, 'displayName' | 'emailVerified' | 'role' | 'email' | 'passwordHash'>>;

export type PublicUser = Omit<User, 'passwordHash'>;
