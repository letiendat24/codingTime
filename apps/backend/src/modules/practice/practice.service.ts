import { createHash } from 'node:crypto';
import {
  JudgeSubmissionStatus,
  PracticeProblemStatus,
  Prisma,
  ScoringMode,
  TestCaseVisibility,
  type PracticeProblemTestCase,
  type PrismaClient,
  type Workspace,
  type WorkspaceFile,
} from '@prisma/client';
import type { Env } from '../../config';
import { paginationMeta } from '../../shared/pagination';
import type { JudgeService } from '../judge/judge.service';
import {
  practiceProblemInvalid,
  practiceProblemNotFound,
  practiceProblemNotOwned,
  practiceProblemNotReady,
  practiceSlugAlreadyExists,
  practiceTestCaseNotFound,
} from './practice.errors';
import { PracticeRepository, practiceProblemInclude } from './practice.repository';
import type {
  CreatePracticeProblemInput,
  ImportPracticeTestCasesInput,
  InstructorPracticeListQuery,
  PracticeSubmissionListQuery,
  PracticeTestCaseInput,
  PracticeTestCaseUpdateInput,
  StudentPracticeListQuery,
  UpdatePracticeProblemInput,
} from './practice.schemas';

const DEFAULT_LANGUAGE = 'javascript';
const SUPPORTED_LANGUAGES = new Set([DEFAULT_LANGUAGE]);

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function safePath(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '')) {
    throw practiceProblemInvalid('File paths must be normalized relative paths');
  }

  return path;
}

function validateLanguage(language: string) {
  const normalized = language.toLowerCase();
  if (!SUPPORTED_LANGUAGES.has(normalized)) {
    throw practiceProblemInvalid('Only JavaScript practice problems are supported in Phase 11');
  }
  return normalized;
}

function filesFromJson(value: unknown) {
  const files = value && typeof value === 'object'
    ? (value as { readonly files?: readonly { readonly path?: unknown; readonly content?: unknown }[] }).files ?? []
    : [];
  return files.map((file) => ({
    path: typeof file.path === 'string' ? file.path : '',
    content: typeof file.content === 'string' ? file.content : '',
  }));
}

function examplesFromJson(value: unknown) {
  return ((value as { readonly examples?: readonly unknown[] } | null)?.examples ?? []) as readonly {
    readonly input: string;
    readonly output: string;
    readonly explanation?: string;
  }[];
}

function validateFiles(files: readonly { readonly path: string; readonly content: string }[], entryFile: string, env: Env) {
  if (files.length > env.WORKSPACE_MAX_FILES) {
    throw practiceProblemInvalid(`Workspace can contain at most ${env.WORKSPACE_MAX_FILES} files`);
  }

  const paths = new Set<string>();
  let totalBytes = 0;

  for (const file of files) {
    const path = safePath(file.path);
    const bytes = Buffer.byteLength(file.content, 'utf8');

    if (paths.has(path)) {
      throw practiceProblemInvalid('Workspace file paths must be unique');
    }
    if (bytes > env.WORKSPACE_MAX_FILE_BYTES) {
      throw practiceProblemInvalid(`Workspace file exceeds ${env.WORKSPACE_MAX_FILE_BYTES} bytes`);
    }
    paths.add(path);
    totalBytes += bytes;
  }

  if (totalBytes > env.WORKSPACE_MAX_TOTAL_BYTES) {
    throw practiceProblemInvalid(`Workspace exceeds ${env.WORKSPACE_MAX_TOTAL_BYTES} bytes`);
  }
  if (!paths.has(entryFile)) {
    throw practiceProblemInvalid('Starter files must include the entry file');
  }
}

function validateResourceLimits(input: { readonly timeLimitMs: number; readonly memoryLimitMb: number }, env: Env) {
  if (input.timeLimitMs < env.JUDGE_MIN_TIME_LIMIT_MS || input.timeLimitMs > env.JUDGE_MAX_TIME_LIMIT_MS) {
    throw practiceProblemInvalid(`timeLimitMs must be between ${env.JUDGE_MIN_TIME_LIMIT_MS} and ${env.JUDGE_MAX_TIME_LIMIT_MS}`);
  }
  if (input.memoryLimitMb < env.JUDGE_MIN_MEMORY_MB || input.memoryLimitMb > env.JUDGE_MAX_MEMORY_MB) {
    throw practiceProblemInvalid(`memoryLimitMb must be between ${env.JUDGE_MIN_MEMORY_MB} and ${env.JUDGE_MAX_MEMORY_MB}`);
  }
}

function validateTestCasePayload(input: { readonly input: string; readonly expectedOutput: string; readonly weight: number }, env: Env) {
  if (Buffer.byteLength(input.input, 'utf8') > env.JUDGE_MAX_TEST_INPUT_BYTES) {
    throw practiceProblemInvalid(`Test input exceeds ${env.JUDGE_MAX_TEST_INPUT_BYTES} bytes`);
  }
  if (Buffer.byteLength(input.expectedOutput, 'utf8') > env.JUDGE_MAX_EXPECTED_OUTPUT_BYTES) {
    throw practiceProblemInvalid(`Expected output exceeds ${env.JUDGE_MAX_EXPECTED_OUTPUT_BYTES} bytes`);
  }
  if (input.weight <= 0) {
    throw practiceProblemInvalid('Test weight must be positive');
  }
}

function normalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForFingerprint(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForFingerprint(item)]),
    );
  }
  return value;
}

function practiceValidationFingerprint(problem: Prisma.PracticeProblemGetPayload<{ include: typeof practiceProblemInclude }>) {
  const payload = {
    title: problem.title,
    description: problem.description,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    examples: examplesFromJson(problem.examplesJson),
    explanation: problem.explanation ?? null,
    language: problem.language,
    entryFile: problem.entryFile,
    starterFiles: filesFromJson(problem.starterFilesJson),
    referenceFiles: filesFromJson(problem.referenceFilesJson),
    executionContract: problem.executionContract,
    comparisonPolicy: problem.comparisonPolicy,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    passScore: Number(problem.passScore),
    scoringMode: problem.scoringMode,
    tests: problem.testCases.map((test) => ({
      name: test.name,
      visibility: test.visibility,
      input: test.input,
      expectedOutput: test.expectedOutput,
      weight: Number(test.weight),
      position: test.position,
    })),
  };

  return createHash('sha256').update(JSON.stringify(normalizeForFingerprint(payload))).digest('hex');
}

function validateStatement(problem: {
  readonly title: string;
  readonly description: string;
  readonly inputFormat: string;
  readonly outputFormat: string;
  readonly constraints: string;
}) {
  const details: string[] = [];

  if (!problem.title.trim()) details.push('Title is required');
  if (!problem.description.trim()) details.push('Problem description is required');
  if (!problem.inputFormat.trim()) details.push('Input format is required');
  if (!problem.outputFormat.trim()) details.push('Output format is required');
  if (!problem.constraints.trim()) details.push('Constraints are required');

  return details;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value instanceof Prisma.Decimal ? value.toNumber() : value ?? null;
}

function mapTestCase(test: PracticeProblemTestCase) {
  return {
    id: test.id,
    name: test.name,
    visibility: test.visibility,
    input: test.input,
    expectedOutput: test.expectedOutput,
    weight: Number(test.weight),
    position: test.position,
  };
}

function mapWorkspace(workspace: Workspace & { files: readonly WorkspaceFile[] }) {
  return {
    id: workspace.id,
    checkpointId: workspace.checkpointId,
    lessonId: workspace.lessonId,
    practiceProblemId: workspace.practiceProblemId,
    language: workspace.language,
    entryFile: workspace.entryFile,
    lastOpenedAt: workspace.lastOpenedAt?.toISOString() ?? null,
    files: workspace.files.map((file) => ({ path: file.path, content: file.content })),
  };
}

function mapProblem(problem: Prisma.PracticeProblemGetPayload<{ include: typeof practiceProblemInclude }>) {
  const publicTests = problem.testCases.filter((test) => test.visibility === TestCaseVisibility.PUBLIC);
  return {
    id: problem.id,
    title: problem.title,
    slug: problem.slug,
    description: problem.description,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    examples: examplesFromJson(problem.examplesJson),
    explanation: problem.explanation,
    difficulty: problem.difficulty,
    status: problem.status,
    language: problem.language,
    entryFile: problem.entryFile,
    starterFiles: filesFromJson(problem.starterFilesJson),
    referenceFiles: filesFromJson(problem.referenceFilesJson),
    executionContract: problem.executionContract,
    comparisonPolicy: problem.comparisonPolicy,
    validatedAt: problem.validatedAt?.toISOString() ?? null,
    validationFingerprint: problem.validationFingerprint,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    passScore: Number(problem.passScore),
    scoringMode: problem.scoringMode,
    createdAt: problem.createdAt.toISOString(),
    publishedAt: problem.publishedAt?.toISOString() ?? null,
    archivedAt: problem.archivedAt?.toISOString() ?? null,
    instructor: { id: problem.createdBy.id, displayName: problem.createdBy.displayName },
    tags: problem.tags.map((item) => ({ id: item.tag.id, name: item.tag.name, slug: item.tag.slug })),
    publicTests: publicTests.map(mapTestCase),
    hiddenTestCount: problem.testCases.length - publicTests.length,
    testCases: problem.testCases.map(mapTestCase),
  };
}

function mapSubmissionHistory(submission: {
  readonly id: string;
  readonly status: JudgeSubmissionStatus;
  readonly score: Prisma.Decimal | number | null;
  readonly passed: boolean | null;
  readonly submittedAt: Date;
  readonly result: { readonly durationMs: number } | null;
}) {
  return {
    id: submission.id,
    status: submission.status,
    score: decimalToNumber(submission.score),
    passed: submission.passed,
    submittedAt: submission.submittedAt.toISOString(),
    durationMs: submission.result?.durationMs ?? null,
  };
}

export class PracticeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: PracticeRepository,
    private readonly judgeService: JudgeService,
    private readonly env: Env,
  ) {}

  async createProblem(instructorId: string, input: CreatePracticeProblemInput) {
    const slug = slugify(input.slug ?? input.title);
    const language = validateLanguage(input.language);
    const entryFile = safePath(input.entryFile);
    const files = input.starterFiles;
    const referenceFiles = input.referenceFiles ?? [];
    const timeLimitMs = input.timeLimitMs ?? 5_000;
    const memoryLimitMb = input.memoryLimitMb ?? 128;
    validateFiles(files, entryFile, this.env);
    if (referenceFiles.length > 0) {
      validateFiles(referenceFiles, entryFile, this.env);
    }
    validateResourceLimits({ timeLimitMs, memoryLimitMb }, this.env);

    try {
      const problem = await this.prisma.$transaction(async (transaction) => {
        const repository = new PracticeRepository(transaction);
        const created = await repository.createProblem({
          createdByUserId: instructorId,
          title: input.title,
          slug,
          description: input.description,
          inputFormat: input.inputFormat,
          outputFormat: input.outputFormat,
          constraints: input.constraints,
          examplesJson: { examples: input.examples } as Prisma.InputJsonValue,
          explanation: input.explanation ?? null,
          difficulty: input.difficulty,
          language,
          entryFile,
          starterFilesJson: { files } as Prisma.InputJsonValue,
          referenceFilesJson: referenceFiles.length > 0 ? { files: referenceFiles } as Prisma.InputJsonValue : Prisma.DbNull,
          executionContract: input.executionContract,
          comparisonPolicy: input.comparisonPolicy,
          timeLimitMs,
          memoryLimitMb,
          passScore: new Prisma.Decimal(input.passScore ?? 70),
          scoringMode: input.scoringMode ?? ScoringMode.WEIGHTED,
        });
        await repository.upsertTags(created.id, input.tags);
        const refreshed = await repository.findInstructorProblem(instructorId, created.id);
        if (!refreshed) {
          throw practiceProblemNotFound();
        }
        return refreshed;
      });
      return { problem: mapProblem(problem) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw practiceSlugAlreadyExists();
      }
      throw error;
    }
  }

  async listInstructorProblems(instructorId: string, query: InstructorPracticeListQuery) {
    const result = await this.repository.listInstructorProblems(instructorId, query);
    return { items: result.items.map(mapProblem), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async getInstructorProblem(instructorId: string, problemId: string) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    return { problem: mapProblem(problem) };
  }

  async updateProblem(instructorId: string, problemId: string, input: UpdatePracticeProblemInput) {
    const existing = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!existing) {
      throw practiceProblemNotOwned();
    }
    if (existing.status !== PracticeProblemStatus.DRAFT) {
      throw practiceProblemInvalid('Only draft practice problems can be edited');
    }

    const language = input.language === undefined ? existing.language : validateLanguage(input.language);
    const entryFile = input.entryFile === undefined ? existing.entryFile : safePath(input.entryFile);
    const files = input.starterFiles ?? filesFromJson(existing.starterFilesJson);
    const referenceFiles = input.referenceFiles ?? filesFromJson(existing.referenceFilesJson);
    const timeLimitMs = input.timeLimitMs ?? existing.timeLimitMs;
    const memoryLimitMb = input.memoryLimitMb ?? existing.memoryLimitMb;
    validateFiles(files, entryFile, this.env);
    if (referenceFiles.length > 0) {
      validateFiles(referenceFiles, entryFile, this.env);
    }
    validateResourceLimits({ timeLimitMs, memoryLimitMb }, this.env);

    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const repository = new PracticeRepository(transaction);
        await repository.updateProblem(problemId, {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.slug !== undefined ? { slug: slugify(input.slug) } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.inputFormat !== undefined ? { inputFormat: input.inputFormat } : {}),
          ...(input.outputFormat !== undefined ? { outputFormat: input.outputFormat } : {}),
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          ...(input.examples !== undefined ? { examplesJson: { examples: input.examples } as Prisma.InputJsonValue } : {}),
          ...(input.explanation !== undefined ? { explanation: input.explanation ?? null } : {}),
          ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
          language,
          entryFile,
          starterFilesJson: { files } as Prisma.InputJsonValue,
          referenceFilesJson: referenceFiles.length > 0 ? { files: referenceFiles } as Prisma.InputJsonValue : Prisma.DbNull,
          ...(input.executionContract !== undefined ? { executionContract: input.executionContract } : {}),
          ...(input.comparisonPolicy !== undefined ? { comparisonPolicy: input.comparisonPolicy } : {}),
          validationFingerprint: null,
          validatedAt: null,
          validationSummaryJson: Prisma.DbNull,
          timeLimitMs,
          memoryLimitMb,
          ...(input.passScore !== undefined ? { passScore: new Prisma.Decimal(input.passScore) } : {}),
          ...(input.scoringMode !== undefined ? { scoringMode: input.scoringMode } : {}),
        });
        if (input.tags !== undefined) {
          await repository.upsertTags(problemId, input.tags);
        }
        const refreshed = await repository.findInstructorProblem(instructorId, problemId);
        if (!refreshed) {
          throw practiceProblemNotFound();
        }
        return refreshed;
      });
      return { problem: mapProblem(updated) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw practiceSlugAlreadyExists();
      }
      throw error;
    }
  }

  async publishProblem(instructorId: string, problemId: string) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    const validation = this.validateProblemShape(problem);
    const fingerprint = practiceValidationFingerprint(problem);
    const details = [
      ...validation.details,
      ...(problem.validationFingerprint !== fingerprint ? ['Problem content changed after the last successful validation'] : []),
    ];
    if (details.length > 0) {
      throw practiceProblemNotReady(details);
    }
    const updated = await this.repository.updateProblem(problemId, {
      status: PracticeProblemStatus.PUBLISHED,
      publishedAt: problem.publishedAt ?? new Date(),
      archivedAt: null,
    });
    return { problem: mapProblem(updated) };
  }

  async validateProblem(instructorId: string, problemId: string) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    const validation = this.validateProblemShape(problem);
    const fingerprint = practiceValidationFingerprint(problem);
    const updated = await this.repository.updateProblem(problemId, {
      validationFingerprint: validation.valid ? fingerprint : null,
      validatedAt: validation.valid ? new Date() : null,
      validationSummaryJson: {
        valid: validation.valid,
        issues: validation.details,
        fingerprint,
        note: 'Practice validation checks authoring contract, required fields, starter/reference files, and test configuration. Reference execution remains asynchronous infrastructure work.',
      } as Prisma.InputJsonValue,
    });

    return {
      valid: validation.valid,
      fingerprint,
      issues: validation.details,
      problem: mapProblem(updated),
    };
  }

  private validateProblemShape(problem: Prisma.PracticeProblemGetPayload<{ include: typeof practiceProblemInclude }>) {
    const details = [
      ...validateStatement(problem),
    ];
    const starterFiles = filesFromJson(problem.starterFilesJson);
    const referenceFiles = filesFromJson(problem.referenceFilesJson);

    if (problem.executionContract !== 'FUNCTION') {
      details.push('Only FUNCTION execution contract is supported');
    }
    if (problem.comparisonPolicy !== 'NORMALIZED_TEXT') {
      details.push('Only NORMALIZED_TEXT comparison policy is supported');
    }
    if (!starterFiles.some((file) => file.path === problem.entryFile)) {
      details.push('Starter files must include the entry file');
    }
    if (!referenceFiles.some((file) => file.path === problem.entryFile)) {
      details.push('Reference solution must include the entry file');
    }
    if (!problem.testCases.some((test) => Number(test.weight) > 0)) {
      details.push('At least one judgeable test case is required');
    }
    if (!problem.testCases.some((test) => test.visibility === TestCaseVisibility.PUBLIC)) {
      details.push('At least one public example test is required');
    }

    return { valid: details.length === 0, details };
  }

  async archiveProblem(instructorId: string, problemId: string) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    const updated = await this.repository.updateProblem(problemId, { status: PracticeProblemStatus.ARCHIVED, archivedAt: new Date() });
    return { problem: mapProblem(updated) };
  }

  async createTestCase(instructorId: string, problemId: string, input: PracticeTestCaseInput) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    if (problem.status !== PracticeProblemStatus.DRAFT) {
      throw practiceProblemInvalid('Only draft practice problems can be edited');
    }
    if (problem.testCases.length >= this.env.JUDGE_MAX_TEST_CASES) {
      throw practiceProblemInvalid(`A practice problem can contain at most ${this.env.JUDGE_MAX_TEST_CASES} test cases`);
    }
    validateTestCasePayload(input, this.env);
    const testCase = await this.repository.createTestCase(problemId, {
      name: input.name,
      visibility: input.visibility,
      input: input.input,
      expectedOutput: input.expectedOutput,
      weight: new Prisma.Decimal(input.weight),
      position: input.position ?? problem.testCases.length + 1,
    });
    await this.repository.updateProblem(problemId, {
      validationFingerprint: null,
      validatedAt: null,
      validationSummaryJson: Prisma.DbNull,
    });
    return { testCase: mapTestCase(testCase) };
  }

  async importTestCases(instructorId: string, problemId: string, input: ImportPracticeTestCasesInput) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    if (problem.status !== PracticeProblemStatus.DRAFT) {
      throw practiceProblemInvalid('Only draft practice problems can be edited');
    }
    const nextCount = input.mode === 'REPLACE' ? input.testCases.length : problem.testCases.length + input.testCases.length;
    if (nextCount > this.env.JUDGE_MAX_TEST_CASES) {
      throw practiceProblemInvalid(`A practice problem can contain at most ${this.env.JUDGE_MAX_TEST_CASES} test cases`);
    }
    input.testCases.forEach((test) => validateTestCasePayload(test, this.env));

    const testCases = await this.prisma.$transaction(async (transaction) => {
      const repository = new PracticeRepository(transaction);
      if (input.mode === 'REPLACE') {
        await repository.deleteTestCases(problemId);
      }
      const offset = input.mode === 'REPLACE' ? 0 : problem.testCases.length;
      for (const [index, test] of input.testCases.entries()) {
        await repository.createTestCase(problemId, {
          name: test.name,
          visibility: test.visibility,
          input: test.input,
          expectedOutput: test.expectedOutput,
          weight: new Prisma.Decimal(test.weight),
          position: offset + index + 1,
        });
      }
      await repository.updateProblem(problemId, {
        validationFingerprint: null,
        validatedAt: null,
        validationSummaryJson: Prisma.DbNull,
      });
      return repository.listTestCases(problemId);
    });

    return {
      imported: input.testCases.length,
      mode: input.mode,
      publicCount: testCases.filter((test) => test.visibility === TestCaseVisibility.PUBLIC).length,
      hiddenCount: testCases.filter((test) => test.visibility === TestCaseVisibility.HIDDEN).length,
      testCases: testCases.map(mapTestCase),
    };
  }

  async updateTestCase(instructorId: string, testCaseId: string, input: PracticeTestCaseUpdateInput) {
    const testCase = await this.repository.findTestCaseForInstructor(instructorId, testCaseId);
    if (!testCase) {
      throw practiceTestCaseNotFound();
    }
    if (testCase.problem.status !== PracticeProblemStatus.DRAFT) {
      throw practiceProblemInvalid('Only draft practice problems can be edited');
    }
    validateTestCasePayload({
      input: input.input ?? testCase.input,
      expectedOutput: input.expectedOutput ?? testCase.expectedOutput,
      weight: input.weight ?? Number(testCase.weight),
    }, this.env);
    const updated = await this.repository.updateTestCase(testCaseId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.input !== undefined ? { input: input.input } : {}),
      ...(input.expectedOutput !== undefined ? { expectedOutput: input.expectedOutput } : {}),
      ...(input.weight !== undefined ? { weight: new Prisma.Decimal(input.weight) } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    });
    await this.repository.updateProblem(testCase.practiceProblemId, {
      validationFingerprint: null,
      validatedAt: null,
      validationSummaryJson: Prisma.DbNull,
    });
    return { testCase: mapTestCase(updated) };
  }

  async deleteTestCase(instructorId: string, testCaseId: string) {
    const testCase = await this.repository.findTestCaseForInstructor(instructorId, testCaseId);
    if (!testCase) {
      throw practiceTestCaseNotFound();
    }
    if (testCase.problem.status !== PracticeProblemStatus.DRAFT) {
      throw practiceProblemInvalid('Only draft practice problems can be edited');
    }
    await this.repository.deleteTestCase(testCaseId);
    await this.repository.updateProblem(testCase.practiceProblemId, {
      validationFingerprint: null,
      validatedAt: null,
      validationSummaryJson: Prisma.DbNull,
    });
  }

  async reorderTestCases(instructorId: string, problemId: string, orderedIds: readonly string[]) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    const existingIds = new Set(problem.testCases.map((test) => test.id));
    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
      throw practiceProblemInvalid('Ordered test case ids must match existing test cases');
    }
    await this.prisma.$transaction(async (transaction) => {
      const repository = new PracticeRepository(transaction);
      for (const [index, id] of orderedIds.entries()) {
        await repository.setTestCasePosition(id, -(index + 1));
      }
      for (const [index, id] of orderedIds.entries()) {
        await repository.setTestCasePosition(id, index + 1);
      }
    });
    return { testCases: (await this.repository.listTestCases(problemId)).map(mapTestCase) };
  }

  async deleteProblem(instructorId: string, problemId: string) {
    const problem = await this.repository.findInstructorProblem(instructorId, problemId);
    if (!problem) {
      throw practiceProblemNotOwned();
    }
    const submissions = await this.repository.countProblemSubmissions(problemId);
    if (submissions > 0) {
      await this.repository.updateProblem(problemId, { status: PracticeProblemStatus.ARCHIVED, archivedAt: new Date() });
      return;
    }
    await this.repository.deleteProblem(problemId);
  }

  async listStudentProblems(userId: string, query: StudentPracticeListQuery) {
    const result = await this.repository.listStudentProblems(userId, query);
    return {
      items: result.items.map((problem) => ({
        id: problem.id,
        title: problem.title,
        slug: problem.slug,
        difficulty: problem.difficulty,
        language: problem.language,
        tags: problem.tags.map((item) => ({ id: item.tag.id, name: item.tag.name, slug: item.tag.slug })),
        progress: problem.progress[0] ? {
          status: problem.progress[0].status,
          attemptCount: problem.progress[0].attemptCount,
          bestScore: decimalToNumber(problem.progress[0].bestScore),
          solvedAt: problem.progress[0].solvedAt?.toISOString() ?? null,
        } : { status: 'NOT_STARTED', attemptCount: 0, bestScore: null, solvedAt: null },
        publicTestCount: problem._count.testCases,
      })),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async listTags() {
    return { items: (await this.repository.listTags()).map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug })) };
  }

  async getStudentProblem(userId: string, slug: string) {
    const problem = await this.repository.findStudentProblemBySlug(userId, slug);
    if (!problem) {
      throw practiceProblemNotFound();
    }
    return {
      problem: {
        id: problem.id,
        title: problem.title,
        slug: problem.slug,
        description: problem.description,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        constraints: problem.constraints,
        examples: examplesFromJson(problem.examplesJson),
        explanation: problem.explanation,
        difficulty: problem.difficulty,
        language: problem.language,
        entryFile: problem.entryFile,
        executionContract: problem.executionContract,
        comparisonPolicy: problem.comparisonPolicy,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        passScore: Number(problem.passScore),
        tags: problem.tags.map((item) => ({ id: item.tag.id, name: item.tag.name, slug: item.tag.slug })),
        publicTests: problem.testCases.map(mapTestCase),
        progress: problem.progress[0] ? {
          status: problem.progress[0].status,
          attemptCount: problem.progress[0].attemptCount,
          bestScore: decimalToNumber(problem.progress[0].bestScore),
          solvedAt: problem.progress[0].solvedAt?.toISOString() ?? null,
        } : { status: 'NOT_STARTED', attemptCount: 0, bestScore: null, solvedAt: null },
      },
    };
  }

  async openWorkspace(userId: string, problemId: string) {
    const problem = await this.repository.findPublishedProblem(problemId);
    if (!problem) {
      throw practiceProblemNotFound();
    }
    const files = filesFromJson(problem.starterFilesJson);
    const workspace = await this.repository.upsertPracticeWorkspace({
      userId,
      problemId,
      language: problem.language,
      entryFile: problem.entryFile,
      files,
      now: new Date(),
    });
    if (!workspace) {
      throw practiceProblemNotFound();
    }
    return { workspace: mapWorkspace(workspace) };
  }

  async resetWorkspace(userId: string, problemId: string) {
    const problem = await this.repository.findPublishedProblem(problemId);
    if (!problem) {
      throw practiceProblemNotFound();
    }
    const workspace = await this.repository.findPracticeWorkspace(userId, problemId);
    if (!workspace) {
      return this.openWorkspace(userId, problemId);
    }
    const files = filesFromJson(problem.starterFilesJson);
    const saved = await this.prisma.$transaction(async (transaction) => {
      const repository = new PracticeRepository(transaction);
      await repository.createWorkspaceRevision({
        workspaceId: workspace.id,
        filesJson: { files: workspace.files.map((file) => ({ path: file.path, content: file.content })) } as Prisma.InputJsonValue,
      });
      return repository.resetPracticeWorkspace({ userId, workspaceId: workspace.id, files });
    });
    if (!saved) {
      throw practiceProblemNotFound();
    }
    return { workspace: mapWorkspace(saved) };
  }

  async submit(userId: string, problemId: string, correlationId: string) {
    const problem = await this.repository.findPublishedProblem(problemId);
    if (!problem) {
      throw practiceProblemNotFound();
    }
    await this.openWorkspace(userId, problemId);
    return this.judgeService.submitPractice(userId, problemId, correlationId);
  }

  async listSubmissions(userId: string, problemId: string, query: PracticeSubmissionListQuery) {
    const problem = await this.repository.findPublishedProblem(problemId);
    if (!problem) {
      throw practiceProblemNotFound();
    }
    const result = await this.repository.listSubmissionsForProblem(userId, problemId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items: result.items.map(mapSubmissionHistory), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async stats(userId: string) {
    const stats = await this.repository.getStats(userId);
    return {
      totalProblems: stats.totalProblems,
      attempted: stats.attempted,
      solved: stats.solved,
      recent: stats.recent.map((progress) => ({
        problem: { id: progress.problem.id, title: progress.problem.title, slug: progress.problem.slug },
        status: progress.status,
        attemptCount: progress.attemptCount,
        bestScore: decimalToNumber(progress.bestScore),
        lastAttemptedAt: progress.lastAttemptedAt?.toISOString() ?? null,
        solvedAt: progress.solvedAt?.toISOString() ?? null,
      })),
    };
  }
}
