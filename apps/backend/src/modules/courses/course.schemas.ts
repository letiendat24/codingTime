import { CourseDifficulty, LessonType } from '@prisma/client';
import { z } from 'zod';

export const uuidParamSchema = z.object({
  courseId: z.string().uuid(),
});

export const moduleIdParamSchema = z.object({
  moduleId: z.string().uuid(),
});

export const lessonIdParamSchema = z.object({
  lessonId: z.string().uuid(),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1).max(160),
});

const basePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const paginationSchema = basePaginationSchema.extend({
  category: z.string().min(1).max(80).optional(),
  difficulty: z.nativeEnum(CourseDifficulty).optional(),
  tag: z.string().min(1).max(80).optional(),
});

export const instructorCourseListQuerySchema = basePaginationSchema;

export const createCourseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(180).optional(),
  shortDescription: z.string().trim().min(1).max(280).optional(),
  description: z.string().trim().min(1).max(10_000).optional(),
  difficulty: z.nativeEnum(CourseDifficulty),
  categoryId: z.string().uuid(),
  thumbnailObjectKey: z.string().trim().min(1).max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});

export const updateCourseSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  slug: z.string().trim().min(1).max(180).optional(),
  shortDescription: z.string().trim().min(1).max(280).nullable().optional(),
  description: z.string().trim().min(1).max(10_000).nullable().optional(),
  difficulty: z.nativeEnum(CourseDifficulty).optional(),
  categoryId: z.string().uuid().optional(),
  thumbnailObjectKey: z.string().trim().min(1).max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

export const createModuleSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2_000).optional(),
});

export const updateModuleSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(2_000).nullable().optional(),
});

export const reorderModulesSchema = z.object({
  moduleIds: z.array(z.string().uuid()).min(1),
});

export const createLessonSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2_000).optional(),
  lessonType: z.nativeEnum(LessonType),
});

export const updateLessonSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(2_000).nullable().optional(),
  lessonType: z.nativeEnum(LessonType).optional(),
});

export const reorderLessonsSchema = z.object({
  lessonIds: z.array(z.string().uuid()).min(1),
});

export type CourseListQuery = z.infer<typeof paginationSchema>;
export type InstructorCourseListQuery = z.infer<typeof instructorCourseListQuerySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
