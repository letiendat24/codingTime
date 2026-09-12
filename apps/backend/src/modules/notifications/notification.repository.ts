import { NotificationCategory, RoleName, UserStatus, type NotificationType, type Prisma, type PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export class NotificationRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async listForUser(userId: string, input: {
    readonly skip: number;
    readonly take: number;
    readonly unread?: boolean;
    readonly category?: NotificationCategory;
    readonly type?: NotificationType;
  }) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(input.unread === true ? { readAt: null } : {}),
      ...(input.unread === false ? { readAt: { not: null } } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.type ? { type: input.type } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  async countUnreadForUser(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async findOwned(userId: string, notificationId: string) {
    return this.prisma.notification.findFirst({ where: { id: notificationId, userId } });
  }

  async markRead(userId: string, notificationId: string, readAt: Date) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findOwned(userId, notificationId);
  }

  async markUnread(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: null },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findOwned(userId, notificationId);
  }

  async markAllRead(userId: string, input: { readonly category?: NotificationCategory; readonly readAt: Date }) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      readAt: null,
      ...(input.category ? { category: input.category } : {}),
    };

    return this.prisma.notification.updateMany({ where, data: { readAt: input.readAt } });
  }

  async getPreference(userId: string) {
    return this.prisma.notificationPreference.findUnique({ where: { userId } });
  }

  async upsertPreference(userId: string, data: {
    readonly learningEnabled?: boolean;
    readonly practiceEnabled?: boolean;
    readonly projectEnabled?: boolean;
    readonly courseEnabled?: boolean;
    readonly systemEnabled?: boolean;
  }) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async findByDedupeKey(dedupeKey: string) {
    return this.prisma.notification.findUnique({ where: { dedupeKey } });
  }

  async create(data: Prisma.NotificationUncheckedCreateInput) {
    return this.prisma.notification.create({ data });
  }

  async createWithDedupe(data: Prisma.NotificationUncheckedCreateInput & { readonly dedupeKey: string }) {
    return this.prisma.notification.upsert({
      where: { dedupeKey: data.dedupeKey },
      create: data,
      update: {},
    });
  }

  async listActiveAdminIds() {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { name: RoleName.ADMIN } } },
      },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }
}
