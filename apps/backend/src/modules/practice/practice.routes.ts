import { RoleName } from '@prisma/client';
import { Router } from 'express';
import type { Env } from '../../config';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { rateLimit, type RateLimiterStore } from '../../middlewares/rate-limit';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { PracticeController } from './practice.controller';

export function createPracticeRouter(
  controller: PracticeController,
  tokenService: TokenService,
  rateLimiterStore: RateLimiterStore,
  env: Env,
) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;
  const submitLimit = rateLimit({
    store: rateLimiterStore,
    windowMs: env.JUDGE_RATE_LIMIT_WINDOW_MS,
    maxRequests: env.JUDGE_RATE_LIMIT_MAX,
    keyPrefix: 'practice-judge',
  });

  router.get('/practice/tags', ...studentOnly, asyncHandler(controller.listTags));
  router.get('/practice/me/stats', ...studentOnly, asyncHandler(controller.stats));
  router.get('/practice/problems', ...studentOnly, asyncHandler(controller.listProblems));
  router.get('/practice/problems/:slug', ...studentOnly, asyncHandler(controller.getProblem));
  router.post('/practice/problems/:problemId/workspace', ...studentOnly, asyncHandler(controller.openWorkspace));
  router.post('/practice/problems/:problemId/workspace/reset', ...studentOnly, asyncHandler(controller.resetWorkspace));
  router.post('/practice/problems/:problemId/submissions', ...studentOnly, submitLimit, asyncHandler(controller.submit));
  router.get('/practice/problems/:problemId/submissions', ...studentOnly, asyncHandler(controller.listSubmissions));

  return router;
}

export function createInstructorPracticeRouter(controller: PracticeController, tokenService: TokenService) {
  const router = Router();
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)] as const;

  router.get('/practice/problems', ...instructorOnly, asyncHandler(controller.listInstructorProblems));
  router.post('/practice/problems', ...instructorOnly, asyncHandler(controller.createProblem));
  router.get('/practice/problems/:problemId', ...instructorOnly, asyncHandler(controller.getInstructorProblem));
  router.patch('/practice/problems/:problemId', ...instructorOnly, asyncHandler(controller.updateProblem));
  router.post('/practice/problems/:problemId/publish', ...instructorOnly, asyncHandler(controller.publishProblem));
  router.post('/practice/problems/:problemId/archive', ...instructorOnly, asyncHandler(controller.archiveProblem));
  router.post('/practice/problems/:problemId/test-cases', ...instructorOnly, asyncHandler(controller.createTestCase));
  router.post('/practice/problems/:problemId/test-cases/reorder', ...instructorOnly, asyncHandler(controller.reorderTestCases));
  router.patch('/practice/test-cases/:testCaseId', ...instructorOnly, asyncHandler(controller.updateTestCase));
  router.delete('/practice/test-cases/:testCaseId', ...instructorOnly, asyncHandler(controller.deleteTestCase));

  return router;
}
