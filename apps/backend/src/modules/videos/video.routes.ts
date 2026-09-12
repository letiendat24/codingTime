import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { VideoController } from './video.controller';

export function createInstructorVideoRouter(controller: VideoController, tokenService: TokenService) {
  const router = Router();
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)] as const;

  router.post('/lessons/:lessonId/video/upload-intent', ...instructorOnly, asyncHandler(controller.createUploadIntent));
  router.post('/videos/:videoAssetId/complete-upload', ...instructorOnly, asyncHandler(controller.completeUpload));
  router.get('/videos/:videoAssetId', ...instructorOnly, asyncHandler(controller.getInstructorVideo));
  router.post('/videos/:videoAssetId/retry', ...instructorOnly, asyncHandler(controller.retry));

  return router;
}

export function createLearningVideoRouter(controller: VideoController, tokenService: TokenService) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;

  router.get('/lessons/:lessonId/video', ...studentOnly, asyncHandler(controller.playback));

  return router;
}
