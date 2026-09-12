import type { RoleName, UserStatus } from '@prisma/client';

export interface SafeUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly roles: readonly RoleName[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AuthSessionMetadata {
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export interface AuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: SafeUser;
}

export interface PublicSession {
  readonly id: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly current: boolean;
}
