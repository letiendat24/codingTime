import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { EnrollmentController } from './enrollment.controller';

export function createCourseEnrollmentRouter(
  controller: EnrollmentController,
  tokenService: TokenService,
): Router {
  const router = Router();

  router.post(
    '/:courseId/enroll',
    requireAuth(tokenService),
    requireRole(RoleName.STUDENT),
    asyncHandler(controller.enroll),
  );

  return router;
}

export function createUserEnrollmentRouter(
  controller: EnrollmentController,
  tokenService: TokenService,
): Router {
  const router = Router();

  router.get('/me/courses', requireAuth(tokenService), asyncHandler(controller.listMyCourses));

  return router;
}
