import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { VideoTranscriptController } from './video-transcript.controller';

export function createInstructorVideoTranscriptRouter(controller: VideoTranscriptController, tokenService: TokenService) {
  const router = Router();
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)] as const;

  router.get('/videos/:videoAssetId/transcripts', ...instructorOnly, asyncHandler(controller.listInstructorTranscripts));
  router.post('/videos/:videoAssetId/transcripts', ...instructorOnly, asyncHandler(controller.createManualTranscript));
  router.post('/videos/:videoAssetId/transcripts/import', ...instructorOnly, asyncHandler(controller.importTranscript));
  router.get('/videos/:videoAssetId/transcripts/:transcriptId', ...instructorOnly, asyncHandler(controller.getInstructorTranscript));
  router.patch('/videos/:videoAssetId/transcripts/:transcriptId', ...instructorOnly, asyncHandler(controller.updateTranscript));
  router.delete('/videos/:videoAssetId/transcripts/:transcriptId', ...instructorOnly, asyncHandler(controller.deleteTranscript));

  return router;
}

export function createStudentVideoTranscriptRouter(controller: VideoTranscriptController, tokenService: TokenService) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;

  router.get('/lessons/:lessonId/transcripts', ...studentOnly, asyncHandler(controller.listStudentTranscripts));
  router.get('/lessons/:lessonId/transcripts/:transcriptId', ...studentOnly, asyncHandler(controller.getStudentTranscript));

  return router;
}
