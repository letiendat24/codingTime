import { ScoringMode, TestCaseVisibility } from '@prisma/client';
import { z } from 'zod';

export const checkpointParamsSchema = z.object({
  checkpointId: z.string().uuid(),
});

export const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const submissionParamsSchema = z.object({
  submissionId: z.string().uuid(),
});

export const testCaseParamsSchema = z.object({
  testCaseId: z.string().uuid(),
});

export const workspaceFileSchema = z.object({
  path: z.string().min(1).max(255),
  content: z.string(),
});

export const upsertCodingConfigSchema = z.object({
  language: z.string().min(1).max(40).default('javascript'),
  entryFile: z.string().min(1).max(255).default('index.js'),
  starterFiles: z.array(workspaceFileSchema).min(1).optional(),
  timeLimitMs: z.number().int().positive().optional(),
  memoryLimitMb: z.number().int().positive().optional(),
  passScore: z.number().min(0).max(100).optional(),
  scoringMode: z.nativeEnum(ScoringMode).optional(),
});

export const testCaseInputSchema = z.object({
  name: z.string().min(1).max(120),
  visibility: z.nativeEnum(TestCaseVisibility),
  input: z.string().default(''),
  expectedOutput: z.string(),
  weight: z.number().positive().max(1000),
  position: z.number().int().min(1).optional(),
});

export const testCaseUpdateSchema = testCaseInputSchema.partial();

export const reorderTestCasesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const submissionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpsertCodingConfigInput = z.infer<typeof upsertCodingConfigSchema>;
export type TestCaseInput = z.infer<typeof testCaseInputSchema>;
export type TestCaseUpdateInput = z.infer<typeof testCaseUpdateSchema>;
export type SubmissionHistoryQuery = z.infer<typeof submissionHistoryQuerySchema>;
