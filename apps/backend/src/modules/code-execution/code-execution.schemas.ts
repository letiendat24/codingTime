import { z } from 'zod';

export const workspaceIdParamSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const checkpointIdParamSchema = z.object({
  checkpointId: z.string().uuid(),
});

export const lessonIdParamSchema = z.object({
  lessonId: z.string().uuid(),
});

export const revisionIdParamSchema = z.object({
  revisionId: z.string().uuid(),
});

export const executionIdParamSchema = z.object({
  executionId: z.string().uuid(),
});

export const workspaceFileSchema = z.object({
  path: z.string().min(1).max(240),
  content: z.string(),
});

export const saveWorkspaceFilesSchema = z.object({
  files: z.array(workspaceFileSchema).min(1),
});

export const importSnapshotSchema = z.object({
  snapshotId: z.string().uuid(),
});

export const executionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type WorkspaceFileInput = z.infer<typeof workspaceFileSchema>;
export type SaveWorkspaceFilesInput = z.infer<typeof saveWorkspaceFilesSchema>;
export type ImportSnapshotInput = z.infer<typeof importSnapshotSchema>;
export type ExecutionHistoryQuery = z.infer<typeof executionHistoryQuerySchema>;
