import { CheckpointProgressStatus, VideoCheckpointType } from '@prisma/client';
import { z } from 'zod';

export const videoAssetIdParamSchema = z.object({
  videoAssetId: z.string().uuid(),
});

export const checkpointIdParamSchema = z.object({
  checkpointId: z.string().uuid(),
});

export const codeSnapshotIdParamSchema = z.object({
  snapshotId: z.string().uuid(),
});

export const videoProgressSchema = z.object({
  positionSeconds: z.coerce.number().finite(),
});

export const checkpointInputSchema = z.object({
  timestampSeconds: z.coerce.number().int().min(0),
  type: z.nativeEnum(VideoCheckpointType),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  required: z.coerce.boolean().default(false),
  pauseVideo: z.coerce.boolean().default(true),
});

export const checkpointUpdateSchema = checkpointInputSchema.partial();

export const checkpointProgressStatusSchema = z.nativeEnum(CheckpointProgressStatus);

const fileSchema = z.object({
  path: z.string().trim().min(1).max(240),
  content: z.string(),
});

export const codeSnapshotInputSchema = z.object({
  timestampSeconds: z.coerce.number().int().min(0),
  title: z.string().trim().max(160).optional().nullable(),
  language: z.string().trim().min(1).max(40),
  files: z.array(fileSchema).min(1),
});

export const codeSnapshotUpdateSchema = codeSnapshotInputSchema.partial();

export const codeAlongConfigSchema = z.object({
  enabled: z.coerce.boolean(),
  language: z.string().trim().min(1).max(40),
  entryFile: z.string().trim().min(1).max(240).optional().nullable(),
});

export type VideoProgressInput = z.infer<typeof videoProgressSchema>;
export type CheckpointInput = z.infer<typeof checkpointInputSchema>;
export type CheckpointUpdateInput = z.infer<typeof checkpointUpdateSchema>;
export type CodeSnapshotInput = z.infer<typeof codeSnapshotInputSchema>;
export type CodeSnapshotUpdateInput = z.infer<typeof codeSnapshotUpdateSchema>;
export type CodeAlongConfigInput = z.infer<typeof codeAlongConfigSchema>;
