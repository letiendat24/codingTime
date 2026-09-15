import { randomUUID } from 'node:crypto';
import {
  JudgeSubmissionStatus,
  Prisma,
  ScoringMode,
  TestCaseResultStatus,
  TestCaseVisibility,
  type CodingCheckpointConfig,
  type JudgeResult,
  type JudgeSubmission,
  type PrismaClient,
  type TestCase,
  type TestCaseResult,
} from '@prisma/client';
import type {
  AsyncMessage,
  CodeJudgeCompletedPayload,
  CodeJudgeFailedPayload,
  CodeJudgeRequestedPayload,
  CodeJudgeStartedPayload,
  CodeJudgeTimedOutPayload,
} from '@codesync/shared';
import type { Env } from '../../config';
import type { AppLogger } from '../../shared/logger';
import { paginationMeta } from '../../shared/pagination';
import type { LearningService } from '../learning/learning.service';
import type { CreateNotificationInput, NotificationService } from '../notifications/notification.service';
import {
  codingCheckpointNotFound,
  codingConfigInvalid,
  judgeActiveLimitExceeded,
  judgeSubmissionNotAllowed,
  judgeSubmissionNotFound,
  judgeWorkspaceNotFound,
  testCaseInvalid,
  testCaseNotFound,
} from './judge.errors';
import { JudgeRepository } from './judge.repository';
import type {
  SubmissionHistoryQuery,
  TestCaseInput,
  TestCaseUpdateInput,
  UpsertCodingConfigInput,
} from './judge.schemas';
import type {
  CodingConfigResponse,
  InstructorTestCaseResponse,
  JudgeSubmissionDetailResponse,
  JudgeSubmissionHistoryItem,
  JudgeSubmissionQueuedResponse,
} from './judge.types';

const DEFAULT_LANGUAGE = 'javascript';
const DEFAULT_ENTRY_FILE = 'index.js';
const SUPPORTED_LANGUAGES = new Set([DEFAULT_LANGUAGE]);

export interface CodeJudgeMessagePublisher {
  publishJudgeRequested(message: AsyncMessage<CodeJudgeRequestedPayload>): void;
}

function safePath(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '')) {
    throw codingConfigInvalid('File paths must be normalized relative paths');
  }

  return path;
}

function validateLanguage(language: string) {
  const normalized = language.toLowerCase();

  if (!SUPPORTED_LANGUAGES.has(normalized)) {
    throw codingConfigInvalid('Only JavaScript judge configuration is supported in Phase 7');
  }

  return normalized;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value instanceof Prisma.Decimal ? value.toNumber() : value ?? null;
}

function starterFilesFromJson(value: unknown) {
  const files = (value as { readonly files?: readonly { readonly path?: unknown; readonly content?: unknown }[] }).files ?? [];

  return files.map((file) => ({
    path: typeof file.path === 'string' ? file.path : '',
    content: typeof file.content === 'string' ? file.content : '',
  }));
}

function validateWorkspaceFiles(files: readonly { readonly path: string; readonly content: string }[], entryFile: string, env: Env) {
  if (files.length > env.WORKSPACE_MAX_FILES) {
    throw judgeSubmissionNotAllowed(`Workspace can contain at most ${env.WORKSPACE_MAX_FILES} files`);
  }

  const paths = new Set<string>();
  let totalBytes = 0;

  for (const file of files) {
    const path = safePath(file.path);
    const bytes = Buffer.byteLength(file.content, 'utf8');

    if (paths.has(path)) {
      throw judgeSubmissionNotAllowed('Workspace file paths must be unique');
    }

    if (bytes > env.WORKSPACE_MAX_FILE_BYTES) {
      throw judgeSubmissionNotAllowed(`Workspace file exceeds ${env.WORKSPACE_MAX_FILE_BYTES} bytes`);
    }

    paths.add(path);
    totalBytes += bytes;
  }

  if (totalBytes > env.WORKSPACE_MAX_TOTAL_BYTES) {
    throw judgeSubmissionNotAllowed(`Workspace exceeds ${env.WORKSPACE_MAX_TOTAL_BYTES} bytes`);
  }

  if (!paths.has(entryFile)) {
    throw judgeSubmissionNotAllowed('Workspace entry file is missing');
  }
}

function validateStarterFiles(files: readonly { readonly path: string; readonly content: string }[], entryFile: string, env: Env) {
  validateWorkspaceFiles(files, entryFile, env);
}

function validateResourceLimits(input: {
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
}, env: Env) {
  if (input.timeLimitMs < env.JUDGE_MIN_TIME_LIMIT_MS || input.timeLimitMs > env.JUDGE_MAX_TIME_LIMIT_MS) {
    throw codingConfigInvalid(`timeLimitMs must be between ${env.JUDGE_MIN_TIME_LIMIT_MS} and ${env.JUDGE_MAX_TIME_LIMIT_MS}`);
  }

  if (input.memoryLimitMb < env.JUDGE_MIN_MEMORY_MB || input.memoryLimitMb > env.JUDGE_MAX_MEMORY_MB) {
    throw codingConfigInvalid(`memoryLimitMb must be between ${env.JUDGE_MIN_MEMORY_MB} and ${env.JUDGE_MAX_MEMORY_MB}`);
  }
}

function validateTestCasePayload(input: {
  readonly input: string;
  readonly expectedOutput: string;
  readonly weight: number;
}, env: Env) {
  if (Buffer.byteLength(input.input, 'utf8') > env.JUDGE_MAX_TEST_INPUT_BYTES) {
    throw testCaseInvalid(`Test input exceeds ${env.JUDGE_MAX_TEST_INPUT_BYTES} bytes`);
  }

  if (Buffer.byteLength(input.expectedOutput, 'utf8') > env.JUDGE_MAX_EXPECTED_OUTPUT_BYTES) {
    throw testCaseInvalid(`Expected output exceeds ${env.JUDGE_MAX_EXPECTED_OUTPUT_BYTES} bytes`);
  }

  if (input.weight <= 0) {
    throw testCaseInvalid('Test weight must be positive');
  }
}

function mapInstructorTest(test: TestCase): InstructorTestCaseResponse {
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

function mapConfig(config: CodingCheckpointConfig & { testCases: readonly TestCase[] }): CodingConfigResponse {
  const publicTests = config.testCases.filter((test) => test.visibility === TestCaseVisibility.PUBLIC);

  return {
    id: config.id,
    checkpointId: config.checkpointId,
    language: config.language,
    entryFile: config.entryFile,
    timeLimitMs: config.timeLimitMs,
    memoryLimitMb: config.memoryLimitMb,
    passScore: Number(config.passScore),
    scoringMode: config.scoringMode,
    starterFiles: starterFilesFromJson(config.starterFilesJson),
    publicTests: publicTests.map((test) => ({
      id: test.id,
      name: test.name,
      input: test.input,
      expectedOutput: test.expectedOutput,
      weight: Number(test.weight),
      position: test.position,
    })),
    hiddenTestCount: config.testCases.length - publicTests.length,
  };
}

function mapSubmission(submission: JudgeSubmission & { result: (JudgeResult & { testResults: readonly TestCaseResult[] }) | null }): JudgeSubmissionDetailResponse {
  let hiddenResultIndex = 0;

  return {
    id: submission.id,
    workspaceId: submission.workspaceId,
    checkpointId: submission.checkpointId,
    practiceProblemId: submission.practiceProblemId,
    status: submission.status,
    score: decimalToNumber(submission.score),
    passed: submission.passed,
    submittedAt: submission.submittedAt.toISOString(),
    startedAt: submission.startedAt?.toISOString() ?? null,
    completedAt: submission.completedAt?.toISOString() ?? null,
    failedAt: submission.failedAt?.toISOString() ?? null,
    result: submission.result
      ? {
          totalScore: Number(submission.result.totalScore),
          maxScore: Number(submission.result.maxScore),
          passed: submission.result.passed,
          totalTests: submission.result.totalTests,
          passedTests: submission.result.passedTests,
          durationMs: submission.result.durationMs,
          peakMemoryBytes: submission.result.peakMemoryBytes?.toString() ?? null,
          testResults: submission.result.testResults.map((result) => {
            const isHidden = result.visibility === TestCaseVisibility.HIDDEN;

            if (isHidden) {
              hiddenResultIndex += 1;
            }

            return {
              id: result.id,
              testCaseId: isHidden ? null : result.testCaseId,
              name: isHidden ? `Hidden test #${hiddenResultIndex}` : result.displayName,
              visibility: result.visibility,
              status: result.status,
              scoreEarned: Number(result.scoreEarned),
              actualOutput: isHidden ? null : result.actualOutput,
              stderr: isHidden ? null : result.stderr,
              durationMs: result.durationMs,
              memoryBytes: result.memoryBytes?.toString() ?? null,
            };
          }),
        }
      : null,
  };
}

function mapSubmissionHistory(submission: JudgeSubmission & { result: JudgeResult | null }): JudgeSubmissionHistoryItem {
  return {
    id: submission.id,
    status: submission.status,
    score: decimalToNumber(submission.score),
    passed: submission.passed,
    submittedAt: submission.submittedAt.toISOString(),
    durationMs: submission.result?.durationMs ?? null,
  };
}

export class JudgeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: JudgeRepository,
    private readonly publisher: CodeJudgeMessagePublisher,
    private readonly env: Env,
    private readonly logger: AppLogger,
    private readonly learningService: LearningService,
    private readonly notificationService?: NotificationService,
  ) {}

  private async createNotifications(notifications: readonly (CreateNotificationInput | null)[]) {
    if (!this.notificationService) {
      return;
    }

    for (const notification of notifications) {
      if (!notification) {
        continue;
      }

      await this.notificationService.create(notification).catch((error: unknown) => {
        this.logger.warn({ error, type: notification.type, userId: notification.userId }, 'judge notification skipped');
      });
    }
  }

  async getCodingConfig(instructorId: string, checkpointId: string) {
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw codingCheckpointNotFound();
    }

    return {
      checkpointId,
      config: checkpoint.codingConfig ? mapConfig(checkpoint.codingConfig) : null,
      testCases: checkpoint.codingConfig?.testCases.map(mapInstructorTest) ?? [],
    };
  }

  async upsertCodingConfig(instructorId: string, checkpointId: string, input: UpsertCodingConfigInput) {
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw codingCheckpointNotFound();
    }

    const language = validateLanguage(input.language ?? checkpoint.codingConfig?.language ?? DEFAULT_LANGUAGE);
    const entryFile = safePath(input.entryFile ?? checkpoint.codingConfig?.entryFile ?? DEFAULT_ENTRY_FILE);
    const existingStarterFiles = checkpoint.codingConfig ? starterFilesFromJson(checkpoint.codingConfig.starterFilesJson) : [];
    const starterFiles = input.starterFiles ?? (existingStarterFiles.length > 0 ? existingStarterFiles : [
      { path: entryFile, content: '' },
    ]);
    const timeLimitMs = input.timeLimitMs ?? checkpoint.codingConfig?.timeLimitMs ?? 5_000;
    const memoryLimitMb = input.memoryLimitMb ?? checkpoint.codingConfig?.memoryLimitMb ?? 128;
    const passScore = input.passScore ?? Number(checkpoint.codingConfig?.passScore ?? 70);
    const scoringMode = input.scoringMode ?? checkpoint.codingConfig?.scoringMode ?? ScoringMode.WEIGHTED;

    validateStarterFiles(starterFiles, entryFile, this.env);
    validateResourceLimits({ timeLimitMs, memoryLimitMb }, this.env);

    const config = await this.repository.upsertCodingConfig(checkpoint.id, {
      checkpointId: checkpoint.id,
      language,
      entryFile,
      starterFilesJson: { files: starterFiles } as Prisma.InputJsonValue,
      timeLimitMs,
      memoryLimitMb,
      passScore: new Prisma.Decimal(passScore),
      scoringMode,
    });

    return { config: mapConfig(config), testCases: config.testCases.map(mapInstructorTest) };
  }

  async createTestCase(instructorId: string, checkpointId: string, input: TestCaseInput) {
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint?.codingConfig) {
      throw codingConfigInvalid('Coding config must exist before adding test cases');
    }

    const existing = checkpoint.codingConfig.testCases;

    if (existing.length >= this.env.JUDGE_MAX_TEST_CASES) {
      throw testCaseInvalid(`A coding checkpoint can contain at most ${this.env.JUDGE_MAX_TEST_CASES} test cases`);
    }

    validateTestCasePayload(input, this.env);
    const position = input.position ?? existing.length + 1;
    const testCase = await this.repository.createTestCase(checkpoint.codingConfig.id, {
      name: input.name,
      visibility: input.visibility,
      input: input.input,
      expectedOutput: input.expectedOutput,
      weight: new Prisma.Decimal(input.weight),
      position,
    });

    return { testCase: mapInstructorTest(testCase) };
  }

  async updateTestCase(instructorId: string, testCaseId: string, input: TestCaseUpdateInput) {
    const testCase = await this.repository.findTestCaseForInstructor(instructorId, testCaseId);

    if (!testCase) {
      throw testCaseNotFound();
    }

    validateTestCasePayload({
      input: input.input ?? testCase.input,
      expectedOutput: input.expectedOutput ?? testCase.expectedOutput,
      weight: input.weight ?? Number(testCase.weight),
    }, this.env);

    const updated = await this.repository.updateTestCase(testCase.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.input !== undefined ? { input: input.input } : {}),
      ...(input.expectedOutput !== undefined ? { expectedOutput: input.expectedOutput } : {}),
      ...(input.weight !== undefined ? { weight: new Prisma.Decimal(input.weight) } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    });

    return { testCase: mapInstructorTest(updated) };
  }

  async deleteTestCase(instructorId: string, testCaseId: string) {
    const testCase = await this.repository.findTestCaseForInstructor(instructorId, testCaseId);

    if (!testCase) {
      throw testCaseNotFound();
    }

    await this.repository.deleteTestCase(testCase.id);
  }

  async reorderTestCases(instructorId: string, checkpointId: string, orderedIds: readonly string[]) {
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint?.codingConfig) {
      throw codingConfigInvalid('Coding config must exist before reordering test cases');
    }

    const existingIds = new Set(checkpoint.codingConfig.testCases.map((test) => test.id));

    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
      throw testCaseInvalid('Ordered test case ids must match existing test cases');
    }

    await this.prisma.$transaction(async (transaction) => {
      const repository = new JudgeRepository(transaction);

      for (const [index, id] of orderedIds.entries()) {
        await repository.setTestCasePosition(id, -(index + 1));
      }

      for (const [index, id] of orderedIds.entries()) {
        await repository.setTestCasePosition(id, index + 1);
      }
    });
    const reordered = await this.repository.listTestCases(checkpoint.codingConfig.id);

    return { testCases: reordered.map(mapInstructorTest) };
  }

  async submitWorkspace(userId: string, workspaceId: string, correlationId: string): Promise<JudgeSubmissionQueuedResponse> {
    const now = new Date();
    const workspace = await this.repository.findWorkspaceForSubmission(userId, workspaceId);

    if (!workspace) {
      throw judgeWorkspaceNotFound();
    }

    if (!workspace.checkpointId || !workspace.checkpoint?.codingConfig) {
      throw judgeSubmissionNotAllowed('Workspace is not tied to a judgeable CODING checkpoint');
    }

    const config = workspace.checkpoint.codingConfig;
    const language = validateLanguage(workspace.language);

    if (language !== config.language.toLowerCase()) {
      throw judgeSubmissionNotAllowed('Workspace language does not match coding checkpoint configuration');
    }

    const files = workspace.files.map((file) => ({ path: file.path, content: file.content }));
    validateWorkspaceFiles(files, config.entryFile, this.env);

    if (config.testCases.length === 0 || !config.testCases.some((test) => Number(test.weight) > 0)) {
      throw judgeSubmissionNotAllowed('Coding checkpoint has no judgeable test cases');
    }

    validateResourceLimits({ timeLimitMs: config.timeLimitMs, memoryLimitMb: config.memoryLimitMb }, this.env);

    const active = await this.repository.countActiveSubmissions(userId);

    if (active >= this.env.JUDGE_MAX_ACTIVE_PER_USER) {
      throw judgeActiveLimitExceeded();
    }

    const submission = await this.repository.createSubmission({
      userId,
      workspaceId,
      checkpointId: workspace.checkpointId,
      codingCheckpointConfigId: config.id,
      language,
      entryFile: config.entryFile,
      filesSnapshotJson: { files } as Prisma.InputJsonValue,
      status: JudgeSubmissionStatus.QUEUED,
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId,
      submittedAt: now,
    });

    const course = workspace.checkpoint.lesson?.module?.course ?? workspace.checkpoint.videoAsset?.lesson?.module?.course;

    await this.repository.createSubmittedActivity({
      userId,
      checkpointId: workspace.checkpointId,
      submissionId: submission.id,
      lessonId: workspace.checkpoint.lessonId,
      courseId: course?.id ?? null,
      createdAt: now,
    });

    const message: AsyncMessage<CodeJudgeRequestedPayload> = {
      jobId: submission.jobId,
      idempotencyKey: submission.idempotencyKey,
      correlationId,
      requestedByUserId: userId,
      createdAt: now.toISOString(),
      payload: {
        submissionId: submission.id,
        checkpointId: workspace.checkpointId,
        practiceProblemId: null,
        language,
        entryFile: config.entryFile,
        timeLimitMs: config.timeLimitMs,
        memoryLimitMb: config.memoryLimitMb,
        passScore: Number(config.passScore),
        scoringMode: config.scoringMode,
        files,
        testCases: config.testCases.map((test) => ({
          id: test.id,
          name: test.name,
          visibility: test.visibility,
          input: test.input,
          expectedOutput: test.expectedOutput,
          weight: Number(test.weight),
          position: test.position,
        })),
      },
    };

    this.publisher.publishJudgeRequested(message);
    this.logger.info({ userId, workspaceId, submissionId: submission.id, correlationId }, 'judge submission queued');

    return { id: submission.id, status: submission.status };
  }

  async submitPractice(userId: string, problemId: string, correlationId: string): Promise<JudgeSubmissionQueuedResponse> {
    const now = new Date();
    const workspace = await this.repository.findPracticeWorkspaceForSubmission(userId, problemId);

    if (!workspace) {
      throw judgeWorkspaceNotFound();
    }

    const problem = workspace.practiceProblem;
    if (!problem) {
      throw judgeWorkspaceNotFound();
    }
    const language = validateLanguage(workspace.language);

    if (language !== problem.language.toLowerCase()) {
      throw judgeSubmissionNotAllowed('Workspace language does not match practice problem configuration');
    }

    const files = workspace.files.map((file) => ({ path: file.path, content: file.content }));
    validateWorkspaceFiles(files, problem.entryFile, this.env);

    if (problem.testCases.length === 0 || !problem.testCases.some((test) => Number(test.weight) > 0)) {
      throw judgeSubmissionNotAllowed('Practice problem has no judgeable test cases');
    }

    validateResourceLimits({ timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb }, this.env);

    const active = await this.repository.countActiveSubmissions(userId);

    if (active >= this.env.JUDGE_MAX_ACTIVE_PER_USER) {
      throw judgeActiveLimitExceeded();
    }

    const submission = await this.repository.createSubmission({
      userId,
      workspaceId: workspace.id,
      checkpointId: null,
      codingCheckpointConfigId: null,
      practiceProblemId: problem.id,
      language,
      entryFile: problem.entryFile,
      filesSnapshotJson: { files } as Prisma.InputJsonValue,
      status: JudgeSubmissionStatus.QUEUED,
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId,
      submittedAt: now,
    });

    const message: AsyncMessage<CodeJudgeRequestedPayload> = {
      jobId: submission.jobId,
      idempotencyKey: submission.idempotencyKey,
      correlationId,
      requestedByUserId: userId,
      createdAt: now.toISOString(),
      payload: {
        submissionId: submission.id,
        checkpointId: null,
        practiceProblemId: problem.id,
        language,
        entryFile: problem.entryFile,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        passScore: Number(problem.passScore),
        scoringMode: problem.scoringMode,
        files,
        testCases: problem.testCases.map((test) => ({
          id: test.id,
          name: test.name,
          visibility: test.visibility,
          input: test.input,
          expectedOutput: test.expectedOutput,
          weight: Number(test.weight),
          position: test.position,
        })),
      },
    };

    this.publisher.publishJudgeRequested(message);
    this.logger.info({ userId, problemId, workspaceId: workspace.id, submissionId: submission.id, correlationId }, 'practice judge submission queued');

    return { id: submission.id, status: submission.status };
  }

  async getSubmission(userId: string, submissionId: string) {
    const submission = await this.repository.findSubmissionForUser(userId, submissionId);

    if (!submission) {
      throw judgeSubmissionNotFound();
    }

    return { submission: mapSubmission(submission) };
  }

  async listSubmissions(userId: string, workspaceId: string, query: SubmissionHistoryQuery) {
    const result = await this.repository.listSubmissionsForWorkspace(userId, workspaceId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      items: result.items.map(mapSubmissionHistory),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async markStarted(message: AsyncMessage<CodeJudgeStartedPayload>) {
    await this.repository.markSubmissionStarted(message.payload.submissionId, new Date());
  }

  async applyCompleted(message: AsyncMessage<CodeJudgeCompletedPayload>) {
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const repository = new JudgeRepository(transaction);

      return repository.applyCompletedResult({
        submissionId: message.payload.submissionId,
        status: message.payload.passed ? JudgeSubmissionStatus.ACCEPTED : JudgeSubmissionStatus.REJECTED,
        totalScore: message.payload.totalScore,
        maxScore: message.payload.maxScore,
        passed: message.payload.passed,
        totalTests: message.payload.totalTests,
        passedTests: message.payload.passedTests,
        durationMs: message.payload.durationMs,
        peakMemoryBytes: message.payload.peakMemoryBytes === null ? null : BigInt(message.payload.peakMemoryBytes),
        testResults: message.payload.testResults.map((result) => ({
          testCaseId: result.testCaseId,
          displayName: result.name,
          visibility: result.visibility,
          status: result.status as TestCaseResultStatus,
          scoreEarned: result.scoreEarned,
          actualOutput: result.visibility === 'PUBLIC' ? result.actualOutput : null,
          stderr: result.visibility === 'PUBLIC' ? result.stderr : null,
          durationMs: result.durationMs,
          memoryBytes: result.memoryBytes === null ? null : BigInt(result.memoryBytes),
        })),
        completedAt: new Date(),
      });
    });

    await this.createNotifications([outcome.notification, outcome.practiceSolvedNotification]);

    if (outcome.lessonShouldComplete && outcome.studentId && outcome.lessonId) {
      await this.learningService.completeLesson(outcome.studentId, outcome.lessonId);
    }
  }

  async applyTimedOut(message: AsyncMessage<CodeJudgeTimedOutPayload>) {
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const repository = new JudgeRepository(transaction);

      return repository.applyCompletedResult({
        submissionId: message.payload.submissionId,
        status: JudgeSubmissionStatus.TIMED_OUT,
        totalScore: 0,
        maxScore: 100,
        passed: false,
        totalTests: message.payload.testResults.length,
        passedTests: 0,
        durationMs: message.payload.durationMs,
        peakMemoryBytes: null,
        testResults: message.payload.testResults.map((result) => ({
          testCaseId: result.testCaseId,
          displayName: result.name,
          visibility: result.visibility,
          status: result.status as TestCaseResultStatus,
          scoreEarned: result.scoreEarned,
          actualOutput: result.visibility === 'PUBLIC' ? result.actualOutput : null,
          stderr: result.visibility === 'PUBLIC' ? result.stderr : null,
          durationMs: result.durationMs,
          memoryBytes: result.memoryBytes === null ? null : BigInt(result.memoryBytes),
        })),
        completedAt: new Date(),
      });
    });

    await this.createNotifications([outcome.notification, outcome.practiceSolvedNotification]);
  }

  async applyFailed(message: AsyncMessage<CodeJudgeFailedPayload>) {
    await this.repository.markSubmissionFailed({
      submissionId: message.payload.submissionId,
      failedAt: new Date(),
      errorCode: message.payload.errorCode,
    });
  }
}
