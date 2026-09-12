import { z } from 'zod';
import { ALLOWED_VIDEO_MIME_TYPES } from './video.constants';

export const lessonIdParamSchema = z.object({
  lessonId: z.string().uuid(),
});

export const videoAssetIdParamSchema = z.object({
  videoAssetId: z.string().uuid(),
});

export const uploadIntentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(ALLOWED_VIDEO_MIME_TYPES),
  sizeBytes: z.coerce.number().int().positive(),
});

export type UploadIntentInput = z.infer<typeof uploadIntentSchema>;
