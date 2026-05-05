import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'node:crypto';
import type {
  IAuthProvider,
  AuthCredentials,
  AuthTokens,
  AuthUser,
  SignUpPayload,
  VerifyResult,
  SignInResult,
} from '@constractor/types';
import type { Config } from '@constractor/config';
import type { IUserRepository } from '../../database/repositories/IUserRepository.js';
import type { IDatabase } from '../../database/DatabaseProvider.js';
import { AppError } from '../../shared/errors.js';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
}

interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  displayName: string;
  language: string;
  canSendVoice: boolean;
  canSendVideo: boolean;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class JWTAuthProvider implements IAuthProvider {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly db: IDatabase,
    private readonly config: Config,
  ) {}

  async signUp(payload: SignUpPayload): Promise<SignInResult> {
    const existing = await this.userRepository.findByEmail(payload.email);
    if (existing) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await this.userRepository.create({
      email: payload.email,
      passwordHash,
      displayName: payload.displayName,
      role: payload.role,
      language: 'en',
    });

    const tokens = await this.generateTokens(user.id);
    return { user: this.toAuthUser(user), tokens };
  }

  async signIn(credentials: AuthCredentials): Promise<SignInResult> {
    const user = await this.userRepository.findByEmail(credentials.email);
    if (!user) throw new AppError('Invalid email or password', 401);

    const valid = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!valid) throw new AppError('Invalid email or password', 401);

    if (!user.isActive) throw new AppError('Account is deactivated', 403);

    const tokens = await this.generateTokens(user.id);
    return { user: this.toAuthUser(user), tokens };
  }

  async verify(accessToken: string): Promise<VerifyResult> {
    try {
      const payload = jwt.verify(
        accessToken,
        this.config.ACCESS_TOKEN_SECRET,
      ) as JWTPayload;

      return {
        valid: true,
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role as AuthUser['role'],
          displayName: payload.displayName,
          language: payload.language ?? 'en',
          emailVerified: true,
          canSendVoice: payload.canSendVoice ?? false,
          canSendVideo: payload.canSendVideo ?? false,
        },
      };
    } catch (err) {
      const message = err instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token';
      return { valid: false, error: message };
    }
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);

    const row = await this.db.queryOne<RefreshTokenRow>(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash],
    );

    if (!row) throw new AppError('Invalid refresh token', 401);
    if (row.revoked_at) {
      // Detected reuse of a revoked token — revoke all for this user
      await this.revokeAll(row.user_id);
      throw new AppError('Refresh token reuse detected — all sessions revoked', 401);
    }
    if (new Date() > row.expires_at) throw new AppError('Refresh token expired', 401);

    // Single-use rotation: revoke old, issue new
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
      [row.id],
    );

    return this.generateTokens(row.user_id);
  }

  async signOut(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [tokenHash],
    );
  }

  async revokeAll(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  }

  private async generateTokens(userId: string): Promise<AuthTokens> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    if (!user.isActive) throw new AppError('Account is deactivated', 403);

    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      language: user.language,
      canSendVoice: user.canSendVoice,
      canSendVideo: user.canSendVideo,
    };

    const accessToken = jwt.sign(payload, this.config.ACCESS_TOKEN_SECRET, {
      expiresIn: this.config.ACCESS_TOKEN_EXPIRES_IN,
    });

    const rawRefreshToken = randomUUID();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + this.config.REFRESH_TOKEN_EXPIRES_IN * 1000,
    );

    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.config.ACCESS_TOKEN_EXPIRES_IN,
    };
  }

  private toAuthUser(user: NonNullable<Awaited<ReturnType<IUserRepository['findById']>>>): AuthUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      language: user.language,
      emailVerified: user.emailVerified,
      canSendVoice: user.canSendVoice,
      canSendVideo: user.canSendVideo,
    };
  }
}
