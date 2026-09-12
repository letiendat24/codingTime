import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { AdminController } from './admin.controller';

export function createAdminRouter(controller: AdminController, tokenService: TokenService) {
  const router = Router();
  const adminOnly = [requireAuth(tokenService), requireRole(RoleName.ADMIN)] as const;

  router.use(...adminOnly);

  router.get('/dashboard', asyncHandler(controller.dashboard));

  router.get('/users', asyncHandler(controller.listUsers));
  router.get('/users/:userId', asyncHandler(controller.getUser));
  router.patch('/users/:userId/status', asyncHandler(controller.updateUserStatus));
  router.put('/users/:userId/roles', asyncHandler(controller.updateUserRoles));

  router.get('/instructors', asyncHandler(controller.listInstructors));
  router.get('/instructors/:userId', asyncHandler(controller.getInstructor));

  router.get('/courses', asyncHandler(controller.listCourses));
  router.get('/courses/:courseId', asyncHandler(controller.getCourse));
  router.post('/courses/:courseId/archive', asyncHandler(controller.archiveCourse));

  router.get('/enrollments', asyncHandler(controller.listEnrollments));

  router.get('/videos', asyncHandler(controller.listVideos));
  router.get('/videos/:videoAssetId', asyncHandler(controller.getVideo));
  router.post('/videos/:videoAssetId/retry', asyncHandler(controller.retryVideo));

  router.get('/code-executions', asyncHandler(controller.listExecutions));
  router.get('/code-executions/:executionId', asyncHandler(controller.getExecution));

  router.get('/judge-submissions', asyncHandler(controller.listJudgeSubmissions));
  router.get('/judge-submissions/:submissionId', asyncHandler(controller.getJudgeSubmission));

  router.get('/project-submissions', asyncHandler(controller.listProjectSubmissions));
  router.get('/project-submissions/:submissionId', asyncHandler(controller.getProjectSubmission));

  router.get('/audit-logs', asyncHandler(controller.listAuditLogs));

  return router;
}
