import { randomUUID } from 'node:crypto';
import {
  ExecutionStatus,
  TestCaseVisibility,
  type ExecutionRequest,
  type ExecutionResult,
  type Prisma,
  type PrismaClient,
  type Workspace,
  type WorkspaceFile,
  type WorkspaceRevision,
} from '@prisma/client';
import type { AsyncMessage, CodeExecutionRequestedPayload } from '@codesync/shared';
import type { Env } from '../../config';
import type { AppLogger } from '../../shared/logger';
import { paginationMeta } from '../../shared/pagination';
import {
  checkpointWorkspaceNotAllowed,
  codeSnapshotImportNotAllowed,
  executionActiveLimitExceeded,
  executionLanguageUnsupported,
  lessonWorkspaceNotAllowed,
  executionNotFound,
  workspaceFileInvalid,
  workspaceNotFound,
  workspaceRevisionNotFound,
} from './code-execution.errors';
import { CodeExecutionRepository } from './code-execution.repository';
import type { ExecutionHistoryQuery, WorkspaceFileInput } from './code-execution.schemas';
import type {
  ExecutionDetailResponse,
  ExecutionHistoryItem,
  ExecutionQueuedResponse,
  WorkspaceResponse,
  WorkspaceRevisionResponse,
} from './code-execution.types';

const DEFAULT_LANGUAGE = 'javascript';
const DEFAULT_ENTRY_FILE = 'index.js';
const DEFAULT_STARTER_FILES: readonly WorkspaceFileInput[] = [
  { path: DEFAULT_ENTRY_FILE, content: 'console.log("Hello from CodeSync");\n' },
];
const SUPPORTED_LANGUAGES = new Set([DEFAULT_LANGUAGE, 'typescript']);

export interface CodeExecutionMessagePublisher {
  publishExecutionRequested(message: AsyncMessage<CodeExecutionRequestedPayload>): void;
}

function safePath(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '')) {
    throw workspaceFileInvalid('Workspace file paths must be normalized relative paths');
  }

  return path;
}

function validateLanguage(language: string) {
  const normalized = language.toLowerCase();

  if (!SUPPORTED_LANGUAGES.has(normalized)) {
    throw executionLanguageUnsupported();
  }

  return normalized;
}

function validateFiles(files: readonly WorkspaceFileInput[], env: Env) {
  if (files.length > env.WORKSPACE_MAX_FILES) {
    throw workspaceFileInvalid(`Workspace can contain at most ${env.WORKSPACE_MAX_FILES} files`);
  }

  const paths = new Set<string>();
  let totalBytes = 0;

  for (const file of files) {
    const path = safePath(file.path);
    const bytes = Buffer.byteLength(file.content, 'utf8');

    if (paths.has(path)) {
      throw workspaceFileInvalid('Workspace file paths must be unique');
    }

    if (bytes > env.WORKSPACE_MAX_FILE_BYTES) {
      throw workspaceFileInvalid(`Workspace file exceeds ${env.WORKSPACE_MAX_FILE_BYTES} bytes`);
    }

    paths.add(path);
    totalBytes += bytes;
  }

  if (totalBytes > env.WORKSPACE_MAX_TOTAL_BYTES) {
    throw workspaceFileInvalid(`Workspace exceeds ${env.WORKSPACE_MAX_TOTAL_BYTES} bytes`);
  }
}

function filesFromJson(value: unknown): WorkspaceFileInput[] {
  const files = (value as { readonly files?: readonly { readonly path?: unknown; readonly content?: unknown }[] }).files ?? [];

  return files.map((file) => ({
    path: typeof file.path === 'string' ? file.path : '',
    content: typeof file.content === 'string' ? file.content : '',
  }));
}

function revisionFilesFromJson(value: unknown): WorkspaceFileInput[] {
  return filesFromJson(value);
}

function mapWorkspace(workspace: Workspace & { files: readonly WorkspaceFile[] }): WorkspaceResponse {
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

function mapRevision(revision: WorkspaceRevision): WorkspaceRevisionResponse {
  return {
    id: revision.id,
    workspaceId: revision.workspaceId,
    source: revision.source,
    createdAt: revision.createdAt.toISOString(),
  };
}

function mapExecution(execution: ExecutionRequest & { result: ExecutionResult | null }): ExecutionDetailResponse {
  return {
    id: execution.id,
    workspaceId: execution.workspaceId,
    status: execution.status,
    language: execution.language,
    entryFile: execution.entryFile,
    createdAt: execution.createdAt.toISOString(),
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    completedAt: execution.completedAt?.toISOString() ?? null,
    failedAt: execution.failedAt?.toISOString() ?? null,
    result: execution.result ? {
      exitCode: execution.result.exitCode,
      stdout: execution.result.stdout,
      stderr: execution.result.stderr,
      durationMs: execution.result.durationMs,
      memoryBytes: execution.result.memoryBytes?.toString() ?? null,
      errorCode: execution.result.errorCode,
    } : null,
  };
}

function mapExecutionHistory(execution: ExecutionRequest & { result: ExecutionResult | null }): ExecutionHistoryItem {
  return {
    id: execution.id,
    status: execution.status,
    createdAt: execution.createdAt.toISOString(),
    durationMs: execution.result?.durationMs ?? null,
    exitCode: execution.result?.exitCode ?? null,
  };
}

export class CodeExecutionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: CodeExecutionRepository,
    private readonly publisher: CodeExecutionMessagePublisher,
    private readonly env: Env,
    private readonly logger: AppLogger,
  ) {}

  async openCheckpointWorkspace(userId: string, checkpointId: string): Promise<WorkspaceResponse> {
    const now = new Date();

    const workspace = await this.prisma.$transaction(async (transaction) => {
      const repository = new CodeExecutionRepository(transaction);
      const checkpoint = await repository.findCodingCheckpointForStudent(userId, checkpointId);

      if (!checkpoint) {
        throw checkpointWorkspaceNotAllowed();
      }

      const language = validateLanguage(checkpoint.codingConfig?.language ?? DEFAULT_LANGUAGE);
      const entryFile = safePath(checkpoint.codingConfig?.entryFile ?? DEFAULT_ENTRY_FILE);
      const files = checkpoint.codingConfig ? filesFromJson(checkpoint.codingConfig.starterFilesJson) : DEFAULT_STARTER_FILES;

      validateFiles(files, this.env);

      const result = await repository.upsertCheckpointWorkspace({
        userId,
        checkpointId: checkpoint.id,
        lessonId: checkpoint.lessonId,
        language,
        entryFile,
        files,
        now,
      });

      if (!result) {
        throw workspaceNotFound();
      }

      return result;
    });

    return mapWorkspace(workspace);
  }

  async openLessonWorkspace(userId: string, lessonId: string): Promise<WorkspaceResponse> {
    const now = new Date();

    const workspace = await this.prisma.$transaction(async (transaction) => {
      const repository = new CodeExecutionRepository(transaction);

      // 1. Check if it's a VIDEO code-along lesson
      const videoLesson = await repository.findCodeAlongLessonForStudent(userId, lessonId);
      if (videoLesson) {
        const starterSnapshot = videoLesson.videoAsset?.codeSnapshots[0];
        const snapshotFiles = starterSnapshot ? filesFromJson(starterSnapshot.filesJson) : [];
        const config = videoLesson.codeAlongConfig?.enabled ? videoLesson.codeAlongConfig : null;
        const language = validateLanguage(config?.language ?? starterSnapshot?.language ?? DEFAULT_LANGUAGE);
        const entryFile = safePath(config?.entryFile ?? snapshotFiles[0]?.path ?? DEFAULT_ENTRY_FILE);
        const files = config
          ? [{ path: entryFile, content: '' }]
          : snapshotFiles.length > 0
            ? snapshotFiles
            : [{ path: entryFile, content: '' }];

        validateFiles(files, this.env);

        const result = await repository.upsertLessonWorkspace({
          userId,
          lessonId: videoLesson.id,
          language,
          entryFile,
          files,
          now,
        });

        if (!result) {
          throw workspaceNotFound();
        }

        return result;
      }

      // 2. Check if it's a standalone CODING lesson
      const codingLesson = await repository.findCodingLessonForStudent(userId, lessonId);
      if (codingLesson) {
        const checkpoint = codingLesson.videoCheckpoints[0];
        const codingConfig = checkpoint?.codingConfig;
        const language = validateLanguage(codingConfig?.language ?? codingLesson.codeAlongConfig?.language ?? DEFAULT_LANGUAGE);
        const entryFile = safePath(codingConfig?.entryFile ?? codingLesson.codeAlongConfig?.entryFile ?? DEFAULT_ENTRY_FILE);
        const files = codingConfig ? filesFromJson(codingConfig.starterFilesJson) : (DEFAULT_STARTER_FILES as WorkspaceFileInput[]);

        validateFiles(files, this.env);

        if (checkpoint) {
          const result = await repository.upsertCheckpointWorkspace({
            userId,
            checkpointId: checkpoint.id,
            lessonId: codingLesson.id,
            language,
            entryFile,
            files,
            now,
          });

          if (!result) {
            throw workspaceNotFound();
          }

          return result;
        }

        const result = await repository.upsertLessonWorkspace({
          userId,
          lessonId: codingLesson.id,
          language,
          entryFile,
          files,
          now,
        });

        if (!result) {
          throw workspaceNotFound();
        }

        return result;
      }

      throw lessonWorkspaceNotAllowed();
    });

    return mapWorkspace(workspace);
  }

  async getCodingLessonDetails(userId: string, lessonId: string) {
    const lesson = await this.repository.findCodingLessonForStudent(userId, lessonId);

    if (!lesson) {
      throw lessonWorkspaceNotAllowed();
    }

    const checkpoint = lesson.videoCheckpoints[0];
    const codingConfig = checkpoint?.codingConfig;

    return {
      lessonId: lesson.id,
      title: lesson.title,
      description: lesson.description,
      checkpointId: checkpoint?.id ?? null,
      config: codingConfig
        ? {
            language: codingConfig.language,
            entryFile: codingConfig.entryFile,
            passScore: Number(codingConfig.passScore),
            scoringMode: codingConfig.scoringMode,
            timeLimitMs: codingConfig.timeLimitMs,
            memoryLimitMb: codingConfig.memoryLimitMb,
            publicTestCases: codingConfig.testCases
              .filter((test) => test.visibility === TestCaseVisibility.PUBLIC)
              .map((test) => ({
                id: test.id,
                name: test.name,
                input: test.input,
                expectedOutput: test.expectedOutput,
                weight: Number(test.weight),
                position: test.position,
              })),
          }
        : null,
    };
  }

  async getWorkspace(userId: string, workspaceId: string) {
    const workspace = await this.repository.findWorkspaceForUser(userId, workspaceId);

    if (!workspace) {
      throw workspaceNotFound();
    }

    return mapWorkspace(workspace);
  }

  async saveFiles(userId: string, workspaceId: string, files: readonly WorkspaceFileInput[]) {
    validateFiles(files, this.env);
    const existing = await this.repository.findWorkspaceForUser(userId, workspaceId);

    if (!existing) {
      throw workspaceNotFound();
    }

    const saved = await this.prisma.$transaction(async (transaction) => {
      const repository = new CodeExecutionRepository(transaction);
      return repository.replaceWorkspaceFiles(userId, workspaceId, files);
    });

    if (!saved) {
      throw workspaceNotFound();
    }

    return mapWorkspace(saved);
  }

  async importSnapshot(userId: string, workspaceId: string, snapshotId: string) {
    const existing = await this.repository.findWorkspaceForUser(userId, workspaceId);

    if (!existing) {
      throw workspaceNotFound();
    }

    const snapshot = await this.repository.findSnapshotForWorkspace(userId, workspaceId, snapshotId);

    if (!snapshot) {
      throw codeSnapshotImportNotAllowed();
    }

    const files = filesFromJson(snapshot.filesJson);
    validateFiles(files, this.env);

    const saved = await this.prisma.$transaction(async (transaction) => {
      const repository = new CodeExecutionRepository(transaction);
      await repository.createWorkspaceRevision({
        workspaceId,
        source: 'AUTO_BEFORE_IMPORT',
        filesJson: { files: existing.files.map((file) => ({ path: file.path, content: file.content })) } as Prisma.InputJsonValue,
      });
      const result = await repository.replaceWorkspaceFiles(userId, workspaceId, files);
      await repository.pruneWorkspaceRevisions(workspaceId, this.env.WORKSPACE_MAX_REVISIONS);
      return result;
    });

    if (!saved) {
      throw workspaceNotFound();
    }

    return mapWorkspace(saved);
  }

  async listRevisions(userId: string, workspaceId: string) {
    const workspace = await this.repository.findWorkspaceForUser(userId, workspaceId);

    if (!workspace) {
      throw workspaceNotFound();
    }

    return {
      items: (await this.repository.listWorkspaceRevisions(userId, workspaceId)).map(mapRevision),
    };
  }

  async restoreRevision(userId: string, workspaceId: string, revisionId: string) {
    const existing = await this.repository.findWorkspaceForUser(userId, workspaceId);

    if (!existing) {
      throw workspaceNotFound();
    }

    const revision = await this.repository.findWorkspaceRevisionForUser(userId, workspaceId, revisionId);

    if (!revision) {
      throw workspaceRevisionNotFound();
    }

    const files = revisionFilesFromJson(revision.filesJson);
    validateFiles(files, this.env);

    const saved = await this.prisma.$transaction(async (transaction) => {
      const repository = new CodeExecutionRepository(transaction);
      await repository.createWorkspaceRevision({
        workspaceId,
        source: 'AUTO_BEFORE_RESTORE',
        filesJson: { files: existing.files.map((file) => ({ path: file.path, content: file.content })) } as Prisma.InputJsonValue,
      });
      const result = await repository.replaceWorkspaceFiles(userId, workspaceId, files);
      await repository.pruneWorkspaceRevisions(workspaceId, this.env.WORKSPACE_MAX_REVISIONS);
      return result;
    });

    if (!saved) {
      throw workspaceNotFound();
    }

    return mapWorkspace(saved);
  }

  async runWorkspace(userId: string, workspaceId: string, correlationId: string): Promise<ExecutionQueuedResponse> {
    const now = new Date();
    const workspace = await this.repository.findWorkspaceForUser(userId, workspaceId);

    if (!workspace) {
      throw workspaceNotFound();
    }

    const language = validateLanguage(workspace.language);
    const files = workspace.files.map((file) => ({ path: file.path, content: file.content }));

    validateFiles(files, this.env);

    if (!files.some((file) => file.path === workspace.entryFile)) {
      throw workspaceFileInvalid('Workspace entry file is missing');
    }

    const activeExecutions = await this.repository.countActiveExecutions(userId);

    if (activeExecutions >= this.env.CODE_EXECUTION_MAX_ACTIVE_PER_USER) {
      throw executionActiveLimitExceeded();
    }

    const execution = await this.repository.createExecution({
      workspaceId,
      userId,
      language,
      entryFile: workspace.entryFile,
      filesSnapshotJson: { files } as Prisma.InputJsonValue,
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId,
      now,
    });
    const message: AsyncMessage<CodeExecutionRequestedPayload> = {
      jobId: execution.jobId,
      idempotencyKey: execution.idempotencyKey,
      correlationId,
      requestedByUserId: userId,
      createdAt: now.toISOString(),
      payload: {
        executionId: execution.id,
        workspaceId,
        language,
        files,
        entryFile: workspace.entryFile,
      },
    };

    this.publisher.publishExecutionRequested(message);
    this.logger.info({ userId, workspaceId, executionId: execution.id, jobId: execution.jobId, correlationId }, 'execution queued');

    return { id: execution.id, status: execution.status };
  }

  async getExecution(userId: string, executionId: string) {
    const execution = await this.repository.findExecutionForUser(userId, executionId);

    if (!execution) {
      throw executionNotFound();
    }

    return mapExecution(execution);
  }

  async listExecutions(userId: string, workspaceId: string, input: ExecutionHistoryQuery) {
    const workspace = await this.repository.findWorkspaceForUser(userId, workspaceId);

    if (!workspace) {
      throw workspaceNotFound();
    }

    const skip = (input.page - 1) * input.limit;
    const result = await this.repository.listExecutionsForWorkspace(userId, workspaceId, { skip, take: input.limit });

    return {
      items: result.items.map(mapExecutionHistory),
      pagination: paginationMeta({ page: input.page, limit: input.limit, total: result.total }),
    };
  }

  async markStarted(executionId: string, startedAt = new Date()) {
    await this.repository.markExecutionStarted({ executionId, startedAt });
  }

  async finishExecution(input: {
    readonly executionId: string;
    readonly status: ExecutionStatus;
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly durationMs: number;
    readonly memoryBytes: number | null;
    readonly errorCode: string | null;
  }) {
    await this.repository.finishExecution({
      ...input,
      memoryBytes: input.memoryBytes === null ? null : BigInt(input.memoryBytes),
      finishedAt: new Date(),
    });
    this.logger.info({ executionId: input.executionId, status: input.status }, 'execution result persisted');
  }
}
