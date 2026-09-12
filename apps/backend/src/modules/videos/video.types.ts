import type { VideoAssetStatus, VideoProcessingJobStatus } from '@prisma/client';

export interface VideoUploadIntentResponse {
  readonly videoAssetId: string;
  readonly uploadUrl: string;
  readonly objectKey: string;
  readonly expiresAt: string;
}

export interface VideoStatusResponse {
  readonly id: string;
  readonly lessonId: string;
  readonly status: VideoAssetStatus;
  readonly progress: number;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: string;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly masterPlaylistObjectKey: string | null;
  readonly thumbnailObjectKey: string | null;
  readonly readyAt: string | null;
  readonly failedAt: string | null;
  readonly renditions: readonly {
    readonly quality: string;
    readonly width: number;
    readonly height: number;
    readonly bitrate: number;
    readonly playlistObjectKey: string;
  }[];
  readonly latestJob: {
    readonly jobId: string;
    readonly status: VideoProcessingJobStatus;
    readonly attemptCount: number;
    readonly lastErrorCode: string | null;
    readonly lastErrorMessage: string | null;
  } | null;
}

export interface VideoPlaybackResponse {
  readonly videoAssetId: string;
  readonly status: 'READY';
  readonly playbackUrl: string;
  readonly durationSeconds: number | null;
}
