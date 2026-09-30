import { PracticeDifficulty, PracticeProblemStatus, ScoringMode, TestCaseVisibility } from '@prisma/client';
import { z } from 'zod';

export const practiceProblemIdParamsSchema = z.object({
  problemId: z.string().uuid(),
});

export const practiceProblemSlugParamsSchema = z.object({
  slug: z.string().min(1).max(140),
});

export const practiceTestCaseParamsSchema = z.object({
  testCaseId: z.string().uuid(),
});

export const practiceExecutionParamsSchema = z.object({
  executionId: z.string().uuid(),
});

export const practiceHiddenTestCaseSourceParamsSchema = practiceProblemIdParamsSchema.extend({
  source: z.enum(['IMPORT', 'GENERATOR']),
});

export const workspaceFileSchema = z.object({
  path: z.string().min(1).max(255),
  content: z.string(),
});

export const practiceExampleSchema = z.object({
  input: z.string().max(10_000),
  output: z.string().max(10_000),
  explanation: z.string().max(10_000).optional(),
});

export const instructorPracticeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(PracticeProblemStatus).optional(),
  difficulty: z.nativeEnum(PracticeDifficulty).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const studentPracticeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  difficulty: z.nativeEnum(PracticeDifficulty).optional(),
  language: z.string().trim().min(1).max(40).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['NOT_STARTED', 'ATTEMPTED', 'SOLVED']).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const practiceSubmissionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createPracticeProblemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().min(1).max(20_000),
  inputFormat: z.string().trim().max(10_000).default(''),
  outputFormat: z.string().trim().max(10_000).default(''),
  constraints: z.string().trim().max(10_000).default(''),
  examples: z.array(practiceExampleSchema).max(12).default([]),
  explanation: z.string().trim().max(20_000).optional(),
  difficulty: z.nativeEnum(PracticeDifficulty),
  language: z.string().trim().min(1).max(40).default('javascript'),
  entryFile: z.string().trim().min(1).max(255).default('index.js'),
  starterFiles: z.array(workspaceFileSchema).min(1).default([{ path: 'index.js', content: '' }]),
  referenceFiles: z.array(workspaceFileSchema).min(1).optional(),
  executionContract: z.literal('FUNCTION').default('FUNCTION'),
  comparisonPolicy: z.literal('NORMALIZED_TEXT').default('NORMALIZED_TEXT'),
  timeLimitMs: z.number().int().positive().optional(),
  memoryLimitMb: z.number().int().positive().optional(),
  passScore: z.number().min(0).max(100).optional(),
  scoringMode: z.nativeEnum(ScoringMode).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
});

export const updatePracticeProblemSchema = createPracticeProblemSchema.partial();

export const practiceTestCaseInputSchema = z.object({
  name: z.string().min(1).max(120),
  visibility: z.nativeEnum(TestCaseVisibility),
  input: z.string().default(''),
  expectedOutput: z.string(),
  weight: z.number().positive().max(1000),
  position: z.number().int().min(1).optional(),
});

export const practiceTestCaseUpdateSchema = practiceTestCaseInputSchema.partial();

export const reorderPracticeTestCasesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const importPracticeTestCasesSchema = z.object({
  version: z.literal(1),
  mode: z.enum(['APPEND', 'REPLACE']).default('APPEND'),
  testCases: z.array(practiceTestCaseInputSchema).min(1).max(100),
});

export const practiceGeneratedTestInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  input: z.unknown(),
  weight: z.number().positive().max(1000).default(1),
});

export const previewPracticeInputImportSchema = z.object({
  version: z.literal(1),
  visibility: z.nativeEnum(TestCaseVisibility).default(TestCaseVisibility.HIDDEN),
  tests: z.array(practiceGeneratedTestInputSchema).min(1).max(100),
});

export const previewPracticeGeneratorSchema = z.object({
  generatorSource: z.string().trim().min(1).max(50_000),
  visibility: z.nativeEnum(TestCaseVisibility).default(TestCaseVisibility.HIDDEN),
});

export const commitPracticeGeneratedTestsSchema = z.object({
  executionId: z.string().uuid(),
  mode: z.enum(['APPEND', 'REPLACE_HIDDEN']).default('APPEND'),
  visibility: z.nativeEnum(TestCaseVisibility).default(TestCaseVisibility.HIDDEN),
  source: z.enum(['EXAMPLE', 'IMPORT', 'GENERATOR']).default('IMPORT'),
});

export type InstructorPracticeListQuery = z.infer<typeof instructorPracticeListQuerySchema>;
export type StudentPracticeListQuery = z.infer<typeof studentPracticeListQuerySchema>;
export type PracticeSubmissionListQuery = z.infer<typeof practiceSubmissionListQuerySchema>;
export type CreatePracticeProblemInput = z.infer<typeof createPracticeProblemSchema>;
export type UpdatePracticeProblemInput = z.infer<typeof updatePracticeProblemSchema>;
export type PracticeTestCaseInput = z.infer<typeof practiceTestCaseInputSchema>;
export type PracticeTestCaseUpdateInput = z.infer<typeof practiceTestCaseUpdateSchema>;
export type ImportPracticeTestCasesInput = z.infer<typeof importPracticeTestCasesSchema>;
export type PreviewPracticeInputImportInput = z.infer<typeof previewPracticeInputImportSchema>;
export type PreviewPracticeGeneratorInput = z.infer<typeof previewPracticeGeneratorSchema>;
export type CommitPracticeGeneratedTestsInput = z.infer<typeof commitPracticeGeneratedTestsSchema>;
export type PracticeHiddenTestCaseSource = z.infer<typeof practiceHiddenTestCaseSourceParamsSchema>['source'];
