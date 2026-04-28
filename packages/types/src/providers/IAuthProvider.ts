export type UserRole = 'admin' | 'contractor' | 'client';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  emailVerified: boolean;
}

export interface SignUpPayload extends AuthCredentials {
  displayName: string;
  role: UserRole;
}

export interface VerifyResult {
  valid: boolean;
  user?: AuthUser;
  error?: string;
}

export interface SignInResult {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface IAuthProvider {
  signIn(credentials: AuthCredentials): Promise<SignInResult>;
  signUp(payload: SignUpPayload): Promise<SignInResult>;
  verify(accessToken: string): Promise<VerifyResult>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  signOut(refreshToken: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
}
