import { NotificationCategory, NotificationType } from '@prisma/client';
import { z } from 'zod';

const optionalBooleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true').optional();
const uuidParamSchema = z.string().uuid();

export const notificationIdParamSchema = z.object({
  notificationId: uuidParamSchema,
});

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unread: optionalBooleanQuery,
  category: z.nativeEnum(NotificationCategory).optional(),
  type: z.nativeEnum(NotificationType).optional(),
});

export const notificationReadAllSchema = z.object({
  category: z.nativeEnum(NotificationCategory).optional(),
}).default({});

export const notificationPreferenceUpdateSchema = z.object({
  learningEnabled: z.boolean().optional(),
  practiceEnabled: z.boolean().optional(),
  projectEnabled: z.boolean().optional(),
  courseEnabled: z.boolean().optional(),
  systemEnabled: z.boolean().optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationReadAllInput = z.infer<typeof notificationReadAllSchema>;
export type NotificationPreferenceUpdateInput = z.infer<typeof notificationPreferenceUpdateSchema>;
