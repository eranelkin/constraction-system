import type { PublicUser } from '../domain/User.js';
import type { UserRole } from '../providers/IAuthProvider.js';

export interface ListUsersResponse { users: PublicUser[] }
export interface UserResponse { user: PublicUser }

export interface CreateUserRequest {
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
  language?: string;
  avatar?: string;        // base64-encoded image
  avatarMimeType?: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  language?: string;
  avatar?: string | null; // base64 to set, null to clear, omit to keep
  avatarMimeType?: string;
}
