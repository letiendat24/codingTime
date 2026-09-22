import { CheckpointProgressStatus, VideoCheckpointType, VideoPracticeBehavior, VideoPracticeVerificationMode, VideoWorkspaceType } from '@prisma/client';
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

export const practiceStepConfigSchema = z.object({
  configMode: z.enum(['AUTO', 'MANUAL_OVERRIDE']).optional(),
  practiceEnabled: z.coerce.boolean().optional(),
  practiceVerificationMode: z.nativeEnum(VideoPracticeVerificationMode).optional(),
  practiceBehavior: z.nativeEnum(VideoPracticeBehavior).optional(),
  overrideVerification: z.nativeEnum(VideoPracticeVerificationMode).optional().nullable(),
  overrideBehavior: z.nativeEnum(VideoPracticeBehavior).optional().nullable(),
  practiceSnapshotId: z.string().uuid().optional().nullable(),
  practiceTargetFilePath: z.string().trim().min(1).max(240).optional().nullable(),
  practiceTargetStartLine: z.coerce.number().int().positive().optional().nullable(),
  practiceTargetEndLine: z.coerce.number().int().positive().optional().nullable(),
  practiceVerificationRules: z.unknown().optional().nullable(),
  workspaceType: z.nativeEnum(VideoWorkspaceType).optional().nullable(),
  allowRun: z.coerce.boolean().optional().nullable(),
  allowCheck: z.coerce.boolean().optional().nullable(),
  allowJudge: z.coerce.boolean().optional().nullable(),
  allowCreateFiles: z.coerce.boolean().optional().nullable(),
  allowCreateFolders: z.coerce.boolean().optional().nullable(),
  allowRenameFiles: z.coerce.boolean().optional().nullable(),
  allowDeleteFiles: z.coerce.boolean().optional().nullable(),
  allowSkip: z.coerce.boolean().optional().nullable(),
});

export const practiceStepCompleteSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional(),
});

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
  workspaceType: z.nativeEnum(VideoWorkspaceType).default(VideoWorkspaceType.SINGLE_FILE),
  allowEditFiles: z.coerce.boolean().default(true),
  allowCreateFiles: z.coerce.boolean().default(false),
  allowCreateFolders: z.coerce.boolean().default(false),
  allowRenameFiles: z.coerce.boolean().default(false),
  allowDeleteFiles: z.coerce.boolean().default(false),
  allowRun: z.coerce.boolean().default(true),
  allowCheck: z.coerce.boolean().default(true),
  allowJudge: z.coerce.boolean().default(true),
  defaultPracticeBehavior: z.nativeEnum(VideoPracticeBehavior).default(VideoPracticeBehavior.REQUIRED),
  defaultVerificationStrategy: z.string().trim().default('AUTO'),
});

export type VideoProgressInput = z.infer<typeof videoProgressSchema>;
export type CheckpointInput = z.infer<typeof checkpointInputSchema>;
export type CheckpointUpdateInput = z.infer<typeof checkpointUpdateSchema>;
export type PracticeStepConfigInput = z.infer<typeof practiceStepConfigSchema>;
export type PracticeStepCompleteInput = z.infer<typeof practiceStepCompleteSchema>;
export type CodeSnapshotInput = z.infer<typeof codeSnapshotInputSchema>;
export type CodeSnapshotUpdateInput = z.infer<typeof codeSnapshotUpdateSchema>;
export type CodeAlongConfigInput = z.infer<typeof codeAlongConfigSchema>;
