import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { rateLimit, type RateLimiterStore } from '../../middlewares/rate-limit';
import { asyncHandler } from '../../shared/async-handler';
import type { Env } from '../../config';
import type { TokenService } from '../auth/token.service';
import type { CodeExecutionController } from './code-execution.controller';

export function createCodeExecutionRouter(
  controller: CodeExecutionController,
  tokenService: TokenService,
  rateLimiterStore: RateLimiterStore,
  env: Env,
) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;
  const executionLimit = rateLimit({
    store: rateLimiterStore,
    windowMs: env.CODE_EXECUTION_RATE_LIMIT_WINDOW_MS,
    maxRequests: env.CODE_EXECUTION_RATE_LIMIT_MAX,
    keyPrefix: 'code-execution',
  });

  router.post('/learning/checkpoints/:checkpointId/workspace', ...studentOnly, asyncHandler(controller.openCheckpointWorkspace));
  router.post('/learning/lessons/:lessonId/workspace', ...studentOnly, asyncHandler(controller.openLessonWorkspace));
  router.get('/learning/lessons/:lessonId/coding', ...studentOnly, asyncHandler(controller.getCodingLessonDetails));
  router.get('/workspaces/:workspaceId', ...studentOnly, asyncHandler(controller.getWorkspace));
  router.put('/workspaces/:workspaceId/files', ...studentOnly, asyncHandler(controller.saveFiles));
  router.post('/workspaces/:workspaceId/import-snapshot', ...studentOnly, asyncHandler(controller.importSnapshot));
  router.get('/workspaces/:workspaceId/revisions', ...studentOnly, asyncHandler(controller.listRevisions));
  router.post('/workspaces/:workspaceId/revisions/:revisionId/restore', ...studentOnly, asyncHandler(controller.restoreRevision));
  router.post('/workspaces/:workspaceId/executions', ...studentOnly, executionLimit, asyncHandler(controller.runWorkspace));
  router.get('/workspaces/:workspaceId/executions', ...studentOnly, asyncHandler(controller.listExecutions));
  router.get('/executions/:executionId', ...studentOnly, asyncHandler(controller.getExecution));

  return router;
}
