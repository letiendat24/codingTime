import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { RoleName } from '@prisma/client';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Env } from '../../config';
import type { AuthContext } from '../../shared/request';

interface AccessTokenClaims extends JwtPayload {
  readonly type: 'access';
  readonly sub: string;
  readonly sessionId: string;
  readonly roles: readonly RoleName[];
}

interface RefreshTokenClaims extends JwtPayload {
  readonly type: 'refresh';
  readonly sub: string;
  readonly sessionId: string;
  readonly tokenId: string;
}

const roleNames = new Set<string>(Object.values(RoleName));

function toEpochSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function isJwtRecord(value: string | JwtPayload): value is JwtPayload {
  return typeof value !== 'string' && value !== null;
}

function readStringClaim(payload: JwtPayload, key: string): string {
  const value = payload[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid JWT claim: ${key}`);
  }

  return value;
}

function readRolesClaim(payload: JwtPayload): RoleName[] {
  const value = payload.roles;

  if (!Array.isArray(value) || value.some((role) => typeof role !== 'string' || !roleNames.has(role))) {
    throw new Error('Invalid JWT roles claim');
  }

  return value as RoleName[];
}

export class TokenService {
  constructor(private readonly env: Env) {}

  issueAccessToken(userId: string, sessionId: string, roles: readonly RoleName[]) {
    const issuedAt = toEpochSeconds(new Date());
    const expiresAt = issuedAt + this.env.JWT_ACCESS_TTL_SECONDS;
    const payload: AccessTokenClaims = {
      type: 'access',
      sub: userId,
      sessionId,
      roles,
      iat: issuedAt,
      exp: expiresAt,
    };

    return jwt.sign(payload, this.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
  }

  issueRefreshToken(userId: string, sessionId: string) {
    const issuedAt = toEpochSeconds(new Date());
    const expiresAtEpoch = issuedAt + this.env.JWT_REFRESH_TTL_SECONDS;
    const expiresAt = new Date(expiresAtEpoch * 1000);
    const payload: RefreshTokenClaims = {
      type: 'refresh',
      sub: userId,
      sessionId,
      tokenId: randomUUID(),
      iat: issuedAt,
      exp: expiresAtEpoch,
    };
    const refreshToken = jwt.sign(payload, this.env.JWT_REFRESH_SECRET, { algorithm: 'HS256' });

    return {
      refreshToken,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      expiresAt,
    };
  }

  issueTokenPair(userId: string, sessionId: string, roles: readonly RoleName[]) {
    const accessToken = this.issueAccessToken(userId, sessionId, roles);
    const refreshToken = this.issueRefreshToken(userId, sessionId);

    return {
      accessToken,
      ...refreshToken,
    };
  }

  verifyAccessToken(token: string): AuthContext {
    const payload = jwt.verify(token, this.env.JWT_ACCESS_SECRET);

    if (!isJwtRecord(payload) || payload.type !== 'access') {
      throw new Error('Invalid access token');
    }

    return {
      userId: readStringClaim(payload, 'sub'),
      sessionId: readStringClaim(payload, 'sessionId'),
      roles: readRolesClaim(payload),
    };
  }

  verifyRefreshToken(token: string): RefreshTokenClaims {
    const payload = jwt.verify(token, this.env.JWT_REFRESH_SECRET);

    if (!isJwtRecord(payload) || payload.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    return {
      type: 'refresh',
      sub: readStringClaim(payload, 'sub'),
      sessionId: readStringClaim(payload, 'sessionId'),
      tokenId: readStringClaim(payload, 'tokenId'),
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('base64url');
  }

  compareRefreshTokenHash(refreshToken: string, expectedHash: string) {
    const actualHash = this.hashRefreshToken(refreshToken);
    const actual = Buffer.from(actualHash);
    const expected = Buffer.from(expectedHash);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
