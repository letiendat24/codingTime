import {
  CourseStatus,
  EnrollmentStatus,
  ExecutionStatus,
  LessonType,
  VideoAssetStatus,
  VideoCheckpointType,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export class CodeExecutionRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findCodingCheckpointForStudent(studentId: string, checkpointId: string) {
    return this.prisma.videoCheckpoint.findFirst({
      where: {
        id: checkpointId,
        type: VideoCheckpointType.CODING,
        videoAsset: {
          status: VideoAssetStatus.READY,
          lesson: {
            module: {
              course: {
                status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
                enrollments: {
                  some: { studentId, status: { not: EnrollmentStatus.CANCELLED } },
                },
              },
            },
          },
        },
      },
      include: {
        codingConfig: true,
        videoAsset: {
          include: { lesson: true },
        },
      },
    });
  }

  async findWorkspaceForUser(userId: string, workspaceId: string) {
    return this.prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
      include: { files: { orderBy: { path: 'asc' } } },
    });
  }

  async findCodeAlongLessonForStudent(studentId: string, lessonId: string) {
    return this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        lessonType: LessonType.VIDEO,
        module: {
          course: {
            status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
            enrollments: { some: { studentId, status: { not: EnrollmentStatus.CANCELLED } } },
          },
        },
        codeAlongConfig: { enabled: true },
        videoAsset: { status: VideoAssetStatus.READY },
      },
      include: { codeAlongConfig: true },
    });
  }

  async upsertCheckpointWorkspace(input: {
    readonly userId: string;
    readonly checkpointId: string;
    readonly lessonId: string;
    readonly language: string;
    readonly entryFile: string;
    readonly files: readonly { readonly path: string; readonly content: string }[];
    readonly now: Date;
  }) {
    const workspace = await this.prisma.workspace.upsert({
      where: {
        userId_checkpointId: {
          userId: input.userId,
          checkpointId: input.checkpointId,
        },
      },
      create: {
        userId: input.userId,
        checkpointId: input.checkpointId,
        lessonId: input.lessonId,
        language: input.language,
        entryFile: input.entryFile,
        lastOpenedAt: input.now,
        files: {
          create: input.files.map((file) => ({
            path: file.path,
            content: file.content,
          })),
        },
      },
      update: {
        lastOpenedAt: input.now,
      },
    });

    return this.findWorkspaceForUser(input.userId, workspace.id);
  }

  async upsertLessonWorkspace(input: {
    readonly userId: string;
    readonly lessonId: string;
    readonly language: string;
    readonly entryFile: string;
    readonly files: readonly { readonly path: string; readonly content: string }[];
    readonly now: Date;
  }) {
    const existing = await this.prisma.workspace.findFirst({
      where: { userId: input.userId, lessonId: input.lessonId, checkpointId: null, practiceProblemId: null },
    });

    if (existing) {
      await this.prisma.workspace.update({ where: { id: existing.id }, data: { lastOpenedAt: input.now } });
      return this.findWorkspaceForUser(input.userId, existing.id);
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        userId: input.userId,
        lessonId: input.lessonId,
        checkpointId: null,
        language: input.language,
        entryFile: input.entryFile,
        lastOpenedAt: input.now,
        files: { create: input.files.map((file) => ({ path: file.path, content: file.content })) },
      },
    });

    return this.findWorkspaceForUser(input.userId, workspace.id);
  }

  async replaceWorkspaceFiles(userId: string, workspaceId: string, files: readonly { readonly path: string; readonly content: string }[]) {
    await this.prisma.workspaceFile.deleteMany({ where: { workspaceId, workspace: { userId } } });
    await this.prisma.workspaceFile.createMany({
      data: files.map((file) => ({ workspaceId, path: file.path, content: file.content })),
    });

    return this.findWorkspaceForUser(userId, workspaceId);
  }

  async findSnapshotForWorkspace(userId: string, workspaceId: string, snapshotId: string) {
    return this.prisma.codeSnapshot.findFirst({
      where: {
        id: snapshotId,
        lesson: { workspaces: { some: { id: workspaceId, userId } } },
        videoAsset: { status: VideoAssetStatus.READY },
      },
    });
  }

  async createWorkspaceRevision(input: {
    readonly workspaceId: string;
    readonly source: string;
    readonly filesJson: Prisma.InputJsonValue;
  }) {
    return this.prisma.workspaceRevision.create({
      data: {
        workspaceId: input.workspaceId,
        source: input.source,
        filesJson: input.filesJson,
      },
    });
  }

  async pruneWorkspaceRevisions(workspaceId: string, maxRevisions: number) {
    const stale = await this.prisma.workspaceRevision.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      skip: maxRevisions,
      select: { id: true },
    });

    if (stale.length > 0) {
      await this.prisma.workspaceRevision.deleteMany({ where: { id: { in: stale.map((revision) => revision.id) } } });
    }
  }

  async listWorkspaceRevisions(userId: string, workspaceId: string) {
    return this.prisma.workspaceRevision.findMany({
      where: { workspaceId, workspace: { userId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findWorkspaceRevisionForUser(userId: string, workspaceId: string, revisionId: string) {
    return this.prisma.workspaceRevision.findFirst({
      where: { id: revisionId, workspaceId, workspace: { userId } },
    });
  }

  async countActiveExecutions(userId: string) {
    return this.prisma.executionRequest.count({
      where: {
        userId,
        status: { in: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING] },
      },
    });
  }

  async createExecution(input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly language: string;
    readonly entryFile: string;
    readonly filesSnapshotJson: Prisma.InputJsonValue;
    readonly jobId: string;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly now: Date;
  }) {
    return this.prisma.executionRequest.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        language: input.language,
        entryFile: input.entryFile,
        filesSnapshotJson: input.filesSnapshotJson,
        status: ExecutionStatus.QUEUED,
        jobId: input.jobId,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        createdAt: input.now,
        queuedAt: input.now,
      },
    });
  }

  async findExecutionForUser(userId: string, executionId: string) {
    return this.prisma.executionRequest.findFirst({
      where: { id: executionId, userId },
      include: { result: true },
    });
  }

  async listExecutionsForWorkspace(userId: string, workspaceId: string, input: { readonly skip: number; readonly take: number }) {
    const where: Prisma.ExecutionRequestWhereInput = { workspaceId, userId };
    const [items, total] = await Promise.all([
      this.prisma.executionRequest.findMany({
        where,
        include: { result: true },
        orderBy: { createdAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.executionRequest.count({ where }),
    ]);

    return { items, total };
  }

  async markExecutionStarted(input: { readonly executionId: string; readonly startedAt: Date }) {
    await this.prisma.executionRequest.updateMany({
      where: {
        id: input.executionId,
        status: ExecutionStatus.QUEUED,
      },
      data: {
        status: ExecutionStatus.RUNNING,
        startedAt: input.startedAt,
      },
    });
  }

  async finishExecution(input: {
    readonly executionId: string;
    readonly status: ExecutionStatus;
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly durationMs: number;
    readonly memoryBytes: bigint | null;
    readonly errorCode: string | null;
    readonly finishedAt: Date;
  }) {
    await this.prisma.executionRequest.updateMany({
      where: {
        id: input.executionId,
        status: { in: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING] },
      },
      data: {
        status: input.status,
        completedAt: input.status === ExecutionStatus.SUCCEEDED ? input.finishedAt : null,
        failedAt: input.status === ExecutionStatus.SUCCEEDED ? null : input.finishedAt,
      },
    });
    await this.prisma.executionResult.upsert({
      where: { executionRequestId: input.executionId },
      create: {
        executionRequestId: input.executionId,
        exitCode: input.exitCode,
        stdout: input.stdout,
        stderr: input.stderr,
        durationMs: input.durationMs,
        memoryBytes: input.memoryBytes,
        errorCode: input.errorCode,
        createdAt: input.finishedAt,
      },
      update: {},
    });
  }
}
