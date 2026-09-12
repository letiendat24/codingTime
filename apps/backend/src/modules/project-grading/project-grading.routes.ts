import { RoleName } from '@prisma/client';
import { Router } from 'express';
import type { Env } from '../../config';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { rateLimit, type RateLimiterStore } from '../../middlewares/rate-limit';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { ProjectGradingController } from './project-grading.controller';

export function createProjectGradingRouter(
  controller: ProjectGradingController,
  tokenService: TokenService,
  rateLimiterStore: RateLimiterStore,
  env: Env,
) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)] as const;
  const submitLimit = rateLimit({
    store: rateLimiterStore,
    windowMs: env.PROJECT_SUBMISSION_RATE_LIMIT_WINDOW_MS,
    maxRequests: env.PROJECT_SUBMISSION_RATE_LIMIT_MAX,
    keyPrefix: 'project-submission',
  });

  router.get('/instructor/checkpoints/:checkpointId/project', ...instructorOnly, asyncHandler(controller.getConfig));
  router.put('/instructor/checkpoints/:checkpointId/project', ...instructorOnly, asyncHandler(controller.upsertConfig));
  router.post('/instructor/checkpoints/:checkpointId/project/rubric', ...instructorOnly, asyncHandler(controller.createCriterion));
  router.patch('/instructor/project-rubric/:criterionId', ...instructorOnly, asyncHandler(controller.updateCriterion));
  router.delete('/instructor/project-rubric/:criterionId', ...instructorOnly, asyncHandler(controller.deleteCriterion));
  router.post('/instructor/checkpoints/:checkpointId/project/rubric/reorder', ...instructorOnly, asyncHandler(controller.reorderCriteria));
  router.get('/instructor/checkpoints/:checkpointId/project-submissions', ...instructorOnly, asyncHandler(controller.listInstructorSubmissions));
  router.post('/instructor/project-submissions/:submissionId/manual-grade', ...instructorOnly, asyncHandler(controller.applyManualGrade));

  router.post('/learning/checkpoints/:checkpointId/project-submissions', ...studentOnly, submitLimit, asyncHandler(controller.submitProject));
  router.get('/learning/checkpoints/:checkpointId/project-submissions', ...studentOnly, asyncHandler(controller.listSubmissions));
  router.get('/project-submissions/:submissionId', ...studentOnly, asyncHandler(controller.getSubmission));

  return router;
}
