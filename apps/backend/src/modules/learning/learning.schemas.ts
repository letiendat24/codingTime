import { LearningActivityType } from '@prisma/client';
import { z } from 'zod';

export const lessonIdParamSchema = z.object({
  lessonId: z.string().uuid(),
});

export const courseIdParamSchema = z.object({
  courseId: z.string().uuid(),
});

export const learningHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  courseId: z.string().uuid().optional(),
  type: z.nativeEnum(LearningActivityType).optional(),
});

export type LearningHistoryQuery = z.infer<typeof learningHistoryQuerySchema>;
