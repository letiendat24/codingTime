import {
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  ExecutionStatus,
  JudgeSubmissionStatus,
  ProjectSubmissionStatus,
  RoleName,
  UserStatus,
  VideoAssetStatus,
} from '@prisma/client';
import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminPeriodQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d']).default('7d'),
});

export const adminUserListQuerySchema = paginationSchema.extend({
  role: z.nativeEnum(RoleName).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const adminInstructorListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const adminCourseListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(CourseStatus).optional(),
  instructorId: z.string().uuid().optional(),
  difficulty: z.nativeEnum(CourseDifficulty).optional(),
  search: z.string().trim().min(1).max(160).optional(),
});

export const adminEnrollmentListQuerySchema = paginationSchema.extend({
  studentId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  status: z.nativeEnum(EnrollmentStatus).optional(),
});

export const adminVideoListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(VideoAssetStatus).optional(),
  courseId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
});

export const adminExecutionListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ExecutionStatus).optional(),
});

export const adminJudgeSubmissionListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(JudgeSubmissionStatus).optional(),
});

export const adminProjectSubmissionListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ProjectSubmissionStatus).optional(),
});

export const adminAuditLogListQuerySchema = paginationSchema.extend({
  action: z.string().trim().min(1).max(80).optional(),
  adminUserId: z.string().uuid().optional(),
  targetType: z.string().trim().min(1).max(80).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const courseIdParamSchema = z.object({
  courseId: z.string().uuid(),
});

export const videoAssetIdParamSchema = z.object({
  videoAssetId: z.string().uuid(),
});

export const executionIdParamSchema = z.object({
  executionId: z.string().uuid(),
});

export const submissionIdParamSchema = z.object({
  submissionId: z.string().uuid(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DISABLED]),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const updateUserRolesSchema = z.object({
  roles: z.array(z.nativeEnum(RoleName)).min(1).max(3),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const adminArchiveCourseSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export type AdminPeriodQuery = z.infer<typeof adminPeriodQuerySchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type AdminInstructorListQuery = z.infer<typeof adminInstructorListQuerySchema>;
export type AdminCourseListQuery = z.infer<typeof adminCourseListQuerySchema>;
export type AdminEnrollmentListQuery = z.infer<typeof adminEnrollmentListQuerySchema>;
export type AdminVideoListQuery = z.infer<typeof adminVideoListQuerySchema>;
export type AdminExecutionListQuery = z.infer<typeof adminExecutionListQuerySchema>;
export type AdminJudgeSubmissionListQuery = z.infer<typeof adminJudgeSubmissionListQuerySchema>;
export type AdminProjectSubmissionListQuery = z.infer<typeof adminProjectSubmissionListQuerySchema>;
export type AdminAuditLogListQuery = z.infer<typeof adminAuditLogListQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;
export type AdminArchiveCourseInput = z.infer<typeof adminArchiveCourseSchema>;
