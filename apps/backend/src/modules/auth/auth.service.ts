import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Prisma, type PrismaClient, UserStatus } from '@prisma/client';
import type { AppLogger } from '../../shared/logger';
import { HttpError } from '../../shared/http-error';
import { UserRepository } from '../users/user.repository';
import { toSafeUser } from '../users/user.service';
import type { UserWithRoles } from '../users/user.types';
import type { AuthResult, AuthSessionMetadata, PublicSession } from './auth.types';
import type { LoginInput, RegisterInput } from './auth.schemas';
import { SessionRepository } from './session.repository';
import { TokenService } from './token.service';

const invalidCredentials = new HttpError(
  401,
  'AUTH_INVALID_CREDENTIALS',
  'Invalid email or password',
);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertActiveUser(user: Pick<UserWithRoles, 'status'>) {
  if (user.status !== UserStatus.ACTIVE) {
    throw new HttpError(403, 'AUTH_ACCOUNT_INACTIVE', 'Account is not active');
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly logger: AppLogger,
  ) {}

  async register(input: RegisterInput, metadata: AuthSessionMetadata): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const existingUser = await this.users.findByEmail(email);

    if (existingUser) {
      throw new HttpError(409, 'USER_EMAIL_ALREADY_EXISTS', 'Email is already registered');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const transactionalUsers = new UserRepository(transaction);
        const transactionalSessions = new SessionRepository(transaction);
        const user = await transactionalUsers.createStudent({
          email,
          passwordHash,
          displayName: input.displayName.trim(),
        });
        const result = await this.createSessionResult(user, metadata, transactionalSessions);

        this.logger.info({ userId: user.id }, 'registration success');

        return result;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, 'USER_EMAIL_ALREADY_EXISTS', 'Email is already registered');
      }

      throw error;
    }
  }

  async login(input: LoginInput, metadata: AuthSessionMetadata): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);

    if (!user) {
      this.logger.warn({ email }, 'login failure');
      throw invalidCredentials;
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.password);

    if (!passwordValid) {
      this.logger.warn({ userId: user.id }, 'login failure');
      throw invalidCredentials;
    }

    assertActiveUser(user);

    const result = await this.createSessionResult(user, metadata, this.sessions);
    this.logger.info({ userId: user.id }, 'login success');

    return result;
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let claims: { sub: string; sessionId: string };

    try {
      claims = this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      this.logger.warn('refresh failure');
      throw new HttpError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }

    const oldRefreshTokenHash = this.tokens.hashRefreshToken(refreshToken);

    return this.prisma.$transaction(async (transaction) => {
      const transactionalSessions = new SessionRepository(transaction);
      const session = await transactionalSessions.findWithUser(claims.sessionId);

      if (!session || session.userId !== claims.sub) {
        this.logger.warn({ sessionId: claims.sessionId }, 'refresh failure');
        throw new HttpError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
      }

      if (session.revokedAt || session.expiresAt <= new Date()) {
        this.logger.warn({ sessionId: session.id }, 'refresh failure');
        throw new HttpError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
      }

      if (!this.tokens.compareRefreshTokenHash(refreshToken, session.refreshTokenHash)) {
        this.logger.warn({ sessionId: session.id }, 'refresh failure');
        throw new HttpError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
      }

      assertActiveUser(session.user);

      const roles = session.user.roles.map((userRole) => userRole.role.name);
      const tokenPair = this.tokens.issueTokenPair(session.user.id, session.id, roles);
      const rotation = await transactionalSessions.rotate({
        sessionId: session.id,
        oldRefreshTokenHash,
        newRefreshTokenHash: tokenPair.refreshTokenHash,
        expiresAt: tokenPair.expiresAt,
      });

      if (rotation.count !== 1) {
        this.logger.warn({ sessionId: session.id }, 'refresh rotation race rejected');
        throw new HttpError(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
      }

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        user: toSafeUser({
          id: session.user.id,
          email: session.user.email,
          passwordHash: session.user.passwordHash,
          displayName: session.user.displayName,
          status: session.user.status,
          createdAt: session.user.createdAt,
          updatedAt: session.user.updatedAt,
          roles,
        }),
      };
    });
  }

  async logout(userId: string, sessionId: string) {
    await this.sessions.revokeCurrent(userId, sessionId);
    this.logger.info({ userId, sessionId }, 'session revoked');
  }

  async logoutAll(userId: string) {
    await this.sessions.revokeAllForUser(userId);
    this.logger.info({ userId }, 'all sessions revoked');
  }

  async listSessions(userId: string, currentSessionId: string): Promise<PublicSession[]> {
    return this.sessions.listActiveForUser(userId, currentSessionId);
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.sessions.revokeCurrent(userId, sessionId);

    if (result.count === 0) {
      throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found');
    }

    this.logger.info({ userId, sessionId }, 'session revoked');
  }

  private async createSessionResult(
    user: UserWithRoles,
    metadata: AuthSessionMetadata,
    sessions: SessionRepository,
  ): Promise<AuthResult> {
    const sessionId = randomUUID();
    const tokenPair = this.tokens.issueTokenPair(user.id, sessionId, user.roles);

    await sessions.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: tokenPair.refreshTokenHash,
      expiresAt: tokenPair.expiresAt,
      userAgent: metadata.userAgent ?? null,
      ipAddress: metadata.ipAddress ?? null,
    });

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      user: toSafeUser(user),
    };
  }
}
