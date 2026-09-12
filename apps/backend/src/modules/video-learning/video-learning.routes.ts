import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { VideoLearningController } from './video-learning.controller';

export function createStudentVideoLearningRouter(controller: VideoLearningController, tokenService: TokenService) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;

  router.get('/lessons/:lessonId/video', ...studentOnly, asyncHandler(controller.playback));
  router.get('/lessons/:lessonId/code-along', ...studentOnly, asyncHandler(controller.getCodeAlong));
  router.put('/videos/:videoAssetId/progress', ...studentOnly, asyncHandler(controller.updateProgress));
  router.post('/checkpoints/:checkpointId/complete', ...studentOnly, asyncHandler(controller.completeCheckpoint));
  router.get('/code-snapshots/:snapshotId', ...studentOnly, asyncHandler(controller.getSnapshotForStudent));

  return router;
}

export function createInstructorVideoLearningRouter(controller: VideoLearningController, tokenService: TokenService) {
  const router = Router();
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)] as const;

  router.post('/videos/:videoAssetId/checkpoints', ...instructorOnly, asyncHandler(controller.createCheckpoint));
  router.put('/lessons/:lessonId/code-along', ...instructorOnly, asyncHandler(controller.upsertCodeAlongConfig));
  router.get('/videos/:videoAssetId/checkpoints', ...instructorOnly, asyncHandler(controller.listCheckpoints));
  router.patch('/checkpoints/:checkpointId', ...instructorOnly, asyncHandler(controller.updateCheckpoint));
  router.delete('/checkpoints/:checkpointId', ...instructorOnly, asyncHandler(controller.deleteCheckpoint));
  router.post('/videos/:videoAssetId/code-snapshots', ...instructorOnly, asyncHandler(controller.createSnapshot));
  router.get('/videos/:videoAssetId/code-snapshots', ...instructorOnly, asyncHandler(controller.listSnapshots));
  router.patch('/code-snapshots/:snapshotId', ...instructorOnly, asyncHandler(controller.updateSnapshot));
  router.delete('/code-snapshots/:snapshotId', ...instructorOnly, asyncHandler(controller.deleteSnapshot));

  return router;
}
