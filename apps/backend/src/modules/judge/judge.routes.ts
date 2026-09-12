import { RoleName } from '@prisma/client';
import { Router } from 'express';
import type { Env } from '../../config';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { rateLimit, type RateLimiterStore } from '../../middlewares/rate-limit';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { JudgeController } from './judge.controller';

export function createJudgeRouter(
  controller: JudgeController,
  tokenService: TokenService,
  rateLimiterStore: RateLimiterStore,
  env: Env,
) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)] as const;
  const submitLimit = rateLimit({
    store: rateLimiterStore,
    windowMs: env.JUDGE_RATE_LIMIT_WINDOW_MS,
    maxRequests: env.JUDGE_RATE_LIMIT_MAX,
    keyPrefix: 'code-judge',
  });

  router.get('/instructor/checkpoints/:checkpointId/coding', ...instructorOnly, asyncHandler(controller.getCodingConfig));
  router.put('/instructor/checkpoints/:checkpointId/coding', ...instructorOnly, asyncHandler(controller.upsertCodingConfig));
  router.post('/instructor/checkpoints/:checkpointId/test-cases', ...instructorOnly, asyncHandler(controller.createTestCase));
  router.patch('/instructor/test-cases/:testCaseId', ...instructorOnly, asyncHandler(controller.updateTestCase));
  router.delete('/instructor/test-cases/:testCaseId', ...instructorOnly, asyncHandler(controller.deleteTestCase));
  router.post('/instructor/checkpoints/:checkpointId/test-cases/reorder', ...instructorOnly, asyncHandler(controller.reorderTestCases));

  router.post('/workspaces/:workspaceId/submissions', ...studentOnly, submitLimit, asyncHandler(controller.submitWorkspace));
  router.get('/workspaces/:workspaceId/submissions', ...studentOnly, asyncHandler(controller.listSubmissions));
  router.get('/submissions/:submissionId', ...studentOnly, asyncHandler(controller.getSubmission));

  return router;
}
