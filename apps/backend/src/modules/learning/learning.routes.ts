import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { LearningController } from './learning.controller';

export function createLearningRouter(controller: LearningController, tokenService: TokenService): Router {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;

  router.post('/lessons/:lessonId/access', ...studentOnly, asyncHandler(controller.accessLesson));
  router.post('/lessons/:lessonId/complete', ...studentOnly, asyncHandler(controller.completeLesson));
  router.get('/resume', ...studentOnly, asyncHandler(controller.resume));
  router.get('/courses/:courseId/progress', ...studentOnly, asyncHandler(controller.courseProgress));
  router.get('/history', ...studentOnly, asyncHandler(controller.history));
  router.get('/dashboard', ...studentOnly, asyncHandler(controller.dashboard));

  return router;
}
