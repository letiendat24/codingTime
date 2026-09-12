import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import {
  checkpointIdParamSchema,
  checkpointInputSchema,
  checkpointUpdateSchema,
  codeAlongConfigSchema,
  codeSnapshotIdParamSchema,
  codeSnapshotInputSchema,
  codeSnapshotUpdateSchema,
  videoAssetIdParamSchema,
  videoProgressSchema,
} from './video-learning.schemas';
import type { VideoLearningService } from './video-learning.service';
import { lessonIdParamSchema } from '../learning/learning.schemas';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class VideoLearningController {
  constructor(private readonly videoLearning: VideoLearningService) {}

  playback = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Pragma', 'no-cache');
    response.status(200).json(await this.videoLearning.getPlayback(auth.userId, params.lessonId));
  };

  streamHls = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    const rawPath = request.params[0] ?? (request.params as Record<string, string>).file ?? '';
    await this.videoLearning.streamHls(auth.userId, params.lessonId, rawPath, request, response);
  };

  getCodeAlong = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json(await this.videoLearning.getCodeAlong(auth.userId, params.lessonId));
  };

  updateProgress = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    const body = videoProgressSchema.parse(request.body);
    response.status(200).json({ progress: await this.videoLearning.updateProgress(auth.userId, params.videoAssetId, body) });
  };

  completeCheckpoint = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = checkpointIdParamSchema.parse(request.params);
    response.status(200).json({ checkpointProgress: await this.videoLearning.completeCheckpoint(auth.userId, params.checkpointId) });
  };

  getSnapshotForStudent = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = codeSnapshotIdParamSchema.parse(request.params);
    response.status(200).json({ codeSnapshot: await this.videoLearning.getSnapshotForStudent(auth.userId, params.snapshotId) });
  };

  createCheckpoint = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    const body = checkpointInputSchema.parse(request.body);
    response.status(201).json({ checkpoint: await this.videoLearning.createCheckpoint(auth.userId, params.videoAssetId, body) });
  };

  upsertCodeAlongConfig = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    const body = codeAlongConfigSchema.parse(request.body);
    response.status(200).json({ config: await this.videoLearning.upsertCodeAlongConfig(auth.userId, params.lessonId, body) });
  };

  listCheckpoints = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(200).json({ checkpoints: await this.videoLearning.listCheckpoints(auth.userId, params.videoAssetId) });
  };

  updateCheckpoint = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = checkpointIdParamSchema.parse(request.params);
    const body = checkpointUpdateSchema.parse(request.body);
    response.status(200).json({ checkpoint: await this.videoLearning.updateCheckpoint(auth.userId, params.checkpointId, body) });
  };

  deleteCheckpoint = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = checkpointIdParamSchema.parse(request.params);
    await this.videoLearning.deleteCheckpoint(auth.userId, params.checkpointId);
    response.status(204).send();
  };

  createSnapshot = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    const body = codeSnapshotInputSchema.parse(request.body);
    response.status(201).json({ codeSnapshot: await this.videoLearning.createSnapshot(auth.userId, params.videoAssetId, body) });
  };

  listSnapshots = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(200).json({ codeSnapshots: await this.videoLearning.listSnapshots(auth.userId, params.videoAssetId) });
  };

  updateSnapshot = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = codeSnapshotIdParamSchema.parse(request.params);
    const body = codeSnapshotUpdateSchema.parse(request.body);
    response.status(200).json({ codeSnapshot: await this.videoLearning.updateSnapshot(auth.userId, params.snapshotId, body) });
  };

  deleteSnapshot = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = codeSnapshotIdParamSchema.parse(request.params);
    await this.videoLearning.deleteSnapshot(auth.userId, params.snapshotId);
    response.status(204).send();
  };
}
