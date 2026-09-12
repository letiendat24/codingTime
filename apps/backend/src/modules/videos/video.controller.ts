import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import { lessonIdParamSchema, uploadIntentSchema, videoAssetIdParamSchema } from './video.schemas';
import { VideoService } from './video.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class VideoController {
  constructor(private readonly videos: VideoService) {}

  createUploadIntent = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    const body = uploadIntentSchema.parse(request.body);
    response.status(201).json(
      await this.videos.createUploadIntent(auth.userId, params.lessonId, body, request.requestId),
    );
  };

  completeUpload = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(200).json({ video: await this.videos.completeUpload(auth.userId, params.videoAssetId, request.requestId) });
  };

  getInstructorVideo = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(200).json({ video: await this.videos.getInstructorVideo(auth.userId, params.videoAssetId) });
  };

  retry = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(202).json({ video: await this.videos.retry(auth.userId, params.videoAssetId, request.requestId) });
  };

  playback = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json(await this.videos.getPlayback(auth.userId, params.lessonId));
  };
}
