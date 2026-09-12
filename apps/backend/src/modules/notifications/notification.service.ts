import {
  NotificationCategory,
  NotificationType,
  Prisma,
  type Notification,
  type NotificationPreference,
} from '@prisma/client';
import { paginationMeta } from '../../shared/pagination';
import type { AppLogger } from '../../shared/logger';
import { notificationActionInvalid, notificationNotFound } from './notification.errors';
import { NotificationRepository } from './notification.repository';
import type { NotificationListQuery, NotificationPreferenceUpdateInput } from './notification.schemas';

export interface CreateNotificationInput {
  readonly userId: string;
  readonly type: NotificationType;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly message: string;
  readonly data?: Prisma.InputJsonValue;
  readonly actionUrl?: string | null;
  readonly dedupeKey?: string | null;
}

function isSafeActionUrl(actionUrl: string) {
  return actionUrl.startsWith('/') && !actionUrl.startsWith('//');
}

function mapNotification(notification: Notification) {
  return {
    id: notification.id,
    type: notification.type,
    category: notification.category,
    title: notification.title,
    message: notification.message,
    data: notification.dataJson,
    actionUrl: notification.actionUrl,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

function defaultPreference(userId: string): NotificationPreference {
  const now = new Date(0);

  return {
    id: '',
    userId,
    learningEnabled: true,
    practiceEnabled: true,
    projectEnabled: true,
    courseEnabled: true,
    systemEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function mapPreference(preference: NotificationPreference) {
  return {
    learningEnabled: preference.learningEnabled,
    practiceEnabled: preference.practiceEnabled,
    projectEnabled: preference.projectEnabled,
    courseEnabled: preference.courseEnabled,
    systemEnabled: preference.systemEnabled,
  };
}

function preferenceKey(category: NotificationCategory) {
  switch (category) {
    case NotificationCategory.LEARNING:
      return 'learningEnabled';
    case NotificationCategory.PRACTICE:
      return 'practiceEnabled';
    case NotificationCategory.PROJECT:
      return 'projectEnabled';
    case NotificationCategory.COURSE:
      return 'courseEnabled';
    case NotificationCategory.SYSTEM:
      return 'systemEnabled';
  }
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly logger: AppLogger,
  ) {}

  async list(userId: string, query: NotificationListQuery) {
    const listInput: {
      skip: number;
      take: number;
      unread?: boolean;
      category?: NotificationCategory;
      type?: NotificationType;
    } = {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    };

    if (query.unread !== undefined) {
      listInput.unread = query.unread;
    }

    if (query.category) {
      listInput.category = query.category;
    }

    if (query.type) {
      listInput.type = query.type;
    }

    const result = await this.repository.listForUser(userId, listInput);

    return {
      items: result.items.map(mapNotification),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async unreadCount(userId: string) {
    return { count: await this.repository.countUnreadForUser(userId) };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.repository.markRead(userId, notificationId, new Date());

    if (!notification) {
      throw notificationNotFound();
    }

    return { notification: mapNotification(notification) };
  }

  async markUnread(userId: string, notificationId: string) {
    const notification = await this.repository.markUnread(userId, notificationId);

    if (!notification) {
      throw notificationNotFound();
    }

    return { notification: mapNotification(notification) };
  }

  async markAllRead(userId: string, category?: NotificationCategory) {
    const input: { category?: NotificationCategory; readAt: Date } = { readAt: new Date() };

    if (category) {
      input.category = category;
    }

    const result = await this.repository.markAllRead(userId, input);
    return { updatedCount: result.count };
  }

  async getPreferences(userId: string) {
    const preference = await this.repository.getPreference(userId);
    return { preferences: mapPreference(preference ?? defaultPreference(userId)) };
  }

  async updatePreferences(userId: string, input: NotificationPreferenceUpdateInput) {
    const data: {
      learningEnabled?: boolean;
      practiceEnabled?: boolean;
      projectEnabled?: boolean;
      courseEnabled?: boolean;
      systemEnabled?: boolean;
    } = {};

    if (input.learningEnabled !== undefined) {
      data.learningEnabled = input.learningEnabled;
    }

    if (input.practiceEnabled !== undefined) {
      data.practiceEnabled = input.practiceEnabled;
    }

    if (input.projectEnabled !== undefined) {
      data.projectEnabled = input.projectEnabled;
    }

    if (input.courseEnabled !== undefined) {
      data.courseEnabled = input.courseEnabled;
    }

    if (input.systemEnabled !== undefined) {
      data.systemEnabled = input.systemEnabled;
    }

    const preference = await this.repository.upsertPreference(userId, data);
    return { preferences: mapPreference(preference) };
  }

  async create(input: CreateNotificationInput) {
    if (input.actionUrl && !isSafeActionUrl(input.actionUrl)) {
      throw notificationActionInvalid();
    }

    const preference = await this.repository.getPreference(input.userId);
    const enabled = (preference ?? defaultPreference(input.userId))[preferenceKey(input.category)];

    if (!enabled) {
      return { notification: null, created: false };
    }

    const data: Prisma.NotificationUncheckedCreateInput = {
      userId: input.userId,
      type: input.type,
      category: input.category,
      title: input.title,
      message: input.message,
      dataJson: input.data ?? Prisma.JsonNull,
      actionUrl: input.actionUrl ?? null,
      dedupeKey: input.dedupeKey ?? null,
    };

    try {
      const notification = input.dedupeKey
        ? await this.repository.createWithDedupe({ ...data, dedupeKey: input.dedupeKey })
        : await this.repository.create(data);

      return { notification: mapNotification(notification), created: true };
    } catch (error) {
      this.logger.error({ error, type: input.type, category: input.category }, 'notification creation failed');
      throw error;
    }
  }

  async notifyAdmins(input: Omit<CreateNotificationInput, 'userId' | 'dedupeKey'> & { readonly dedupeKeyPrefix: string }) {
    const adminIds = await this.repository.listActiveAdminIds();

    await Promise.all(adminIds.map((adminId) => this.create({
      ...input,
      userId: adminId,
      dedupeKey: `${input.dedupeKeyPrefix}:${adminId}`,
    }).catch((error: unknown) => {
      this.logger.warn({ error, adminId, type: input.type }, 'admin notification creation failed');
    })));
  }
}
