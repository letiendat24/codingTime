import { ProjectAutoCheckType, ProjectCriterionType, RepositoryProvider } from '@prisma/client';
import { z } from 'zod';

export const checkpointParamsSchema = z.object({
  checkpointId: z.string().uuid(),
});

export const criterionParamsSchema = z.object({
  criterionId: z.string().uuid(),
});

export const submissionParamsSchema = z.object({
  submissionId: z.string().uuid(),
});

export const upsertProjectConfigSchema = z.object({
  repositoryProvider: z.nativeEnum(RepositoryProvider).default(RepositoryProvider.GITHUB),
  defaultBranch: z.string().trim().min(1).max(120).optional().nullable(),
  requireDeploymentUrl: z.boolean().default(false),
  maxRepositoryBytes: z.number().int().min(1_024).optional(),
  maxBuildTimeMs: z.number().int().min(500).optional(),
  maxTestTimeMs: z.number().int().min(500).optional(),
  passScore: z.number().min(0).max(100).optional(),
});

export const autoCriterionConfigSchema = z.object({
  path: z.string().min(1).max(255).optional(),
  jsonPath: z.array(z.string().min(1).max(80)).min(1).max(8).optional(),
});

export const rubricCriterionInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  type: z.nativeEnum(ProjectCriterionType),
  autoCheckType: z.nativeEnum(ProjectAutoCheckType).optional().nullable(),
  config: autoCriterionConfigSchema.optional().nullable(),
  weight: z.number().positive().max(1000),
  required: z.boolean().default(false),
  position: z.number().int().min(1).optional(),
});

export const rubricCriterionUpdateSchema = rubricCriterionInputSchema.partial();

export const reorderRubricSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const submitProjectSchema = z.object({
  repositoryUrl: z.string().trim().min(1).max(500),
  branch: z.string().trim().min(1).max(120).optional(),
  deploymentUrl: z.string().trim().min(1).max(500).optional().nullable(),
});

export const submissionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const manualGradeSchema = z.object({
  criteria: z.array(z.object({
    criterionId: z.string().uuid(),
    score: z.number().min(0).max(1000),
    feedback: z.string().trim().max(2000).optional().nullable(),
  })).min(1),
});

export type UpsertProjectConfigInput = z.infer<typeof upsertProjectConfigSchema>;
export type RubricCriterionInput = z.infer<typeof rubricCriterionInputSchema>;
export type RubricCriterionUpdateInput = z.infer<typeof rubricCriterionUpdateSchema>;
export type SubmitProjectInput = z.infer<typeof submitProjectSchema>;
export type SubmissionHistoryQuery = z.infer<typeof submissionHistoryQuerySchema>;
export type ManualGradeInput = z.infer<typeof manualGradeSchema>;
