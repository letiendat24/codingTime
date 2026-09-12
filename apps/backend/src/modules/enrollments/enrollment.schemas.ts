import { z } from 'zod';

export const courseIdParamSchema = z.object({
  courseId: z.string().uuid(),
});

export const myCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type MyCoursesQuery = z.infer<typeof myCoursesQuerySchema>;
