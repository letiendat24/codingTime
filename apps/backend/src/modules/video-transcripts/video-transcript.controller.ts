import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import {
  importTranscriptSchema,
  lessonIdParamSchema,
  manualTranscriptSchema,
  transcriptIdParamSchema,
  updateTranscriptSchema,
  videoAssetIdParamSchema,
} from './video-transcript.schemas';
import type { VideoTranscriptService } from './video-transcript.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class VideoTranscriptController {
  constructor(private readonly transcripts: VideoTranscriptService) {}

  listInstructorTranscripts = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(200).json(await this.transcripts.listInstructorTranscripts(auth.userId, params.videoAssetId));
  };

  createManualTranscript = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    const body = manualTranscriptSchema.parse(request.body);
    response.status(201).json(await this.transcripts.createManualTranscript(auth.userId, params.videoAssetId, body));
  };

  importTranscript = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    const body = importTranscriptSchema.parse(request.body);
    response.status(201).json(await this.transcripts.importTranscript(auth.userId, params.videoAssetId, body));
  };

  getInstructorTranscript = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const videoParams = videoAssetIdParamSchema.parse(request.params);
    const transcriptParams = transcriptIdParamSchema.parse(request.params);
    response.status(200).json(await this.transcripts.getInstructorTranscript(auth.userId, videoParams.videoAssetId, transcriptParams.transcriptId));
  };

  updateTranscript = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const videoParams = videoAssetIdParamSchema.parse(request.params);
    const transcriptParams = transcriptIdParamSchema.parse(request.params);
    const body = updateTranscriptSchema.parse(request.body);
    response.status(200).json(await this.transcripts.updateTranscript(auth.userId, videoParams.videoAssetId, transcriptParams.transcriptId, body));
  };

  deleteTranscript = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const videoParams = videoAssetIdParamSchema.parse(request.params);
    const transcriptParams = transcriptIdParamSchema.parse(request.params);
    await this.transcripts.deleteTranscript(auth.userId, videoParams.videoAssetId, transcriptParams.transcriptId);
    response.status(204).send();
  };

  listStudentTranscripts = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json(await this.transcripts.listStudentTranscripts(auth.userId, params.lessonId));
  };

  getStudentTranscript = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const lessonParams = lessonIdParamSchema.parse(request.params);
    const transcriptParams = transcriptIdParamSchema.parse(request.params);
    response.status(200).json(await this.transcripts.getStudentTranscript(auth.userId, lessonParams.lessonId, transcriptParams.transcriptId));
  };
}
