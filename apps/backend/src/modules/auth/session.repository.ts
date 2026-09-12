import { type Prisma, type PrismaClient } from '@prisma/client';
import type { PublicSession } from './auth.types';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const includeSessionUser = {
  user: {
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  },
} satisfies Prisma.SessionInclude;

export type SessionWithUser = Prisma.SessionGetPayload<{ include: typeof includeSessionUser }>;

export class SessionRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async create(input: {
    readonly id: string;
    readonly userId: string;
    readonly refreshTokenHash: string;
    readonly expiresAt: Date;
    readonly userAgent: string | null;
    readonly ipAddress: string | null;
  }) {
    return this.prisma.session.create({
      data: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        lastUsedAt: new Date(),
      },
    });
  }

  async findWithUser(sessionId: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({
      where: { id: sessionId },
      include: includeSessionUser,
    });
  }

  async rotate(input: {
    readonly sessionId: string;
    readonly oldRefreshTokenHash: string;
    readonly newRefreshTokenHash: string;
    readonly expiresAt: Date;
  }) {
    return this.prisma.session.updateMany({
      where: {
        id: input.sessionId,
        refreshTokenHash: input.oldRefreshTokenHash,
        revokedAt: null,
      },
      data: {
        refreshTokenHash: input.newRefreshTokenHash,
        expiresAt: input.expiresAt,
        lastUsedAt: new Date(),
      },
    });
  }

  async revokeCurrent(userId: string, sessionId: string) {
    return this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllForUser(userId: string) {
    return this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async listActiveForUser(userId: string, currentSessionId: string): Promise<PublicSession[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      current: session.id === currentSessionId,
    }));
  }
}
