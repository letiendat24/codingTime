import { TranscriptStatus } from '@prisma/client';
import { z } from 'zod';

const languageSchema = z.string().trim().min(2).max(16).regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i);

export const videoAssetIdParamSchema = z.object({
  videoAssetId: z.string().uuid(),
});

export const lessonIdParamSchema = z.object({
  lessonId: z.string().uuid(),
});

export const transcriptIdParamSchema = z.object({
  transcriptId: z.string().uuid(),
});

export const transcriptSegmentInputSchema = z.object({
  startTimeMs: z.number().int().min(0),
  endTimeMs: z.number().int().positive(),
  text: z.string().trim().min(1).max(4000),
});

export const manualTranscriptSchema = z.object({
  language: languageSchema,
  title: z.string().trim().max(120).optional().nullable(),
  status: z.nativeEnum(TranscriptStatus).optional().default(TranscriptStatus.READY),
  segments: z.array(transcriptSegmentInputSchema).min(1).max(5000),
});

export const updateTranscriptSchema = z.object({
  language: languageSchema.optional(),
  title: z.string().trim().max(120).optional().nullable(),
  status: z.nativeEnum(TranscriptStatus).optional(),
  segments: z.array(transcriptSegmentInputSchema).min(1).max(5000).optional(),
});

export const importTranscriptSchema = z.object({
  language: languageSchema,
  title: z.string().trim().max(120).optional().nullable(),
  filename: z.string().trim().min(1).max(255),
  content: z.string().min(1).max(2_000_000),
});

export type ManualTranscriptInput = z.infer<typeof manualTranscriptSchema>;
export type UpdateTranscriptInput = z.infer<typeof updateTranscriptSchema>;
export type ImportTranscriptInput = z.infer<typeof importTranscriptSchema>;
export type TranscriptSegmentInput = z.infer<typeof transcriptSegmentInputSchema>;
