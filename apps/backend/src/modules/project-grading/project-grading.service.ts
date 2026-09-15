import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  Prisma,
  ProjectAutoCheckType,
  ProjectCriterionType,
  ProjectRubricResultStatus,
  ProjectSubmissionStatus,
  RepositoryProvider,
  NotificationCategory,
  NotificationType,
  type ProjectCheckpointConfig,
  type ProjectGrade,
  type ProjectRubricCriterion,
  type ProjectRubricResult,
  type ProjectSubmission,
  type PrismaClient,
} from '@prisma/client';
import type {
  AsyncMessage,
  ProjectGradingCompletedPayload,
  ProjectGradingFailedPayload,
  ProjectGradingRequestedPayload,
  ProjectGradingStartedPayload,
  ProjectGradingTimedOutPayload,
  ProjectRubricCriterionPayload,
} from '@codesync/shared';
import type { Env } from '../../config';
import type { AppLogger } from '../../shared/logger';
import { paginationMeta } from '../../shared/pagination';
import type { LearningService } from '../learning/learning.service';
import type { CreateNotificationInput, NotificationService } from '../notifications/notification.service';
import {
  projectCheckpointNotFound,
  projectConfigInvalid,
  projectRubricCriterionNotFound,
  projectRubricInvalid,
  projectSubmissionActiveLimitExceeded,
  projectSubmissionNotAllowed,
  projectSubmissionNotFound,
} from './project-grading.errors';
import { ProjectGradingRepository } from './project-grading.repository';
import { calculateProjectScore } from './project-grading.scoring';
import type {
  ManualGradeInput,
  RubricCriterionInput,
  RubricCriterionUpdateInput,
  SubmissionHistoryQuery,
  SubmitProjectInput,
  UpsertProjectConfigInput,
} from './project-grading.schemas';
import type { ProjectConfigResponse, ProjectSubmissionDetailResponse } from './project-grading.types';

const execFileAsync = promisify(execFile);
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+$/;
const GIT_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;

export interface ProjectGradingMessagePublisher {
  publishProjectGradingRequested(message: AsyncMessage<ProjectGradingRequestedPayload>): void;
}

export interface CommitResolver {
  resolve(input: { readonly owner: string; readonly repo: string; readonly ref: string; readonly timeoutMs: number }): Promise<string>;
}

export class GitCommitResolver implements CommitResolver {
  async resolve(input: { readonly owner: string; readonly repo: string; readonly ref: string; readonly timeoutMs: number }) {
    const cloneUrl = trustedGithubCloneUrl(input.owner, input.repo);
    const { stdout } = await execFileAsync('git', ['ls-remote', cloneUrl, input.ref], {
      timeout: input.timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const first = stdout.split('\n').find((line) => line.trim().length > 0)?.split(/\s+/)[0];

    if (!first || !COMMIT_SHA_PATTERN.test(first)) {
      throw projectSubmissionNotAllowed('Repository branch or ref could not be resolved');
    }

    return first.toLowerCase();
  }
}

function trustedGithubCloneUrl(owner: string, repo: string) {
  return `https://github.com/${owner}/${repo}.git`;
}

function parseGithubRepositoryUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw projectSubmissionNotAllowed('Repository URL must be a valid GitHub HTTPS URL');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password) {
    throw projectSubmissionNotAllowed('Only public HTTPS GitHub repository URLs are supported');
  }

  const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);

  if (parts.length !== 2) {
    throw projectSubmissionNotAllowed('Repository URL must use https://github.com/{owner}/{repo}');
  }

  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, '');

  if (!GITHUB_REPO_PATTERN.test(owner) || !GITHUB_REPO_PATTERN.test(repo)) {
    throw projectSubmissionNotAllowed('Repository owner or name contains unsupported characters');
  }

  return { owner, repo, normalizedUrl: `https://github.com/${owner}/${repo}` };
}

function validateBranch(ref: string) {
  if (!GIT_REF_PATTERN.test(ref) || ref.includes('..') || ref.startsWith('/') || ref.endsWith('/') || ref.includes('@{')) {
    throw projectSubmissionNotAllowed('Repository branch or ref is invalid');
  }

  return ref;
}

function validateDeploymentUrl(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw projectSubmissionNotAllowed('Deployment URL must be valid');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw projectSubmissionNotAllowed('Deployment URL must be HTTP/HTTPS and cannot include credentials');
  }

  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname.toLowerCase())) {
    throw projectSubmissionNotAllowed('Deployment URL cannot target local addresses');
  }

  return url.toString();
}

function safePath(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '')) {
    throw projectRubricInvalid('Rubric file paths must be normalized relative paths');
  }

  return path;
}

function validateCriterion(input: RubricCriterionInput | RubricCriterionUpdateInput) {
  if (input.type === ProjectCriterionType.MANUAL && input.autoCheckType) {
    throw projectRubricInvalid('Manual criteria cannot define automatic check type');
  }

  if (input.type === ProjectCriterionType.AUTO && !input.autoCheckType) {
    throw projectRubricInvalid('Automatic criteria require an autoCheckType');
  }

  if (input.autoCheckType === ProjectAutoCheckType.FILE_EXISTS) {
    const path = input.config?.path;

    if (!path) {
      throw projectRubricInvalid('FILE_EXISTS criteria require config.path');
    }

    safePath(path);
  }

  if (input.autoCheckType === ProjectAutoCheckType.JSON_FIELD) {
    const path = input.config?.path;
    const jsonPath = input.config?.jsonPath;

    if (!path || !jsonPath?.length) {
      throw projectRubricInvalid('JSON_FIELD criteria require config.path and config.jsonPath');
    }

    safePath(path);
  }

  if (input.autoCheckType === ProjectAutoCheckType.DEPLOYMENT_HEALTH) {
    throw projectRubricInvalid('Deployment health checks are deferred until SSRF protections are hardened');
  }
}

function mapConfig(config: ProjectCheckpointConfig): ProjectConfigResponse {
  return {
    id: config.id,
    checkpointId: config.checkpointId,
    repositoryProvider: config.repositoryProvider,
    defaultBranch: config.defaultBranch,
    requireDeploymentUrl: config.requireDeploymentUrl,
    maxRepositoryBytes: config.maxRepositoryBytes.toString(),
    maxBuildTimeMs: config.maxBuildTimeMs,
    maxTestTimeMs: config.maxTestTimeMs,
    passScore: Number(config.passScore),
  };
}

function mapCriterion(criterion: ProjectRubricCriterion) {
  return {
    id: criterion.id,
    title: criterion.title,
    description: criterion.description,
    type: criterion.type,
    autoCheckType: criterion.autoCheckType,
    config: criterion.configJson,
    weight: Number(criterion.weight),
    required: criterion.required,
    position: criterion.position,
  };
}

function mapSubmission(submission: ProjectSubmission & { grade: (ProjectGrade & { results: readonly ProjectRubricResult[] }) | null }): ProjectSubmissionDetailResponse {
  return {
    id: submission.id,
    checkpointId: submission.checkpointId,
    repositoryUrl: submission.repositoryUrl,
    repositoryOwner: submission.repositoryOwner,
    repositoryName: submission.repositoryName,
    branch: submission.branch,
    commitSha: submission.commitSha,
    deploymentUrl: submission.deploymentUrl,
    status: submission.status,
    score: submission.score ? Number(submission.score) : null,
    passed: submission.passed,
    submittedAt: submission.submittedAt.toISOString(),
    startedAt: submission.startedAt?.toISOString() ?? null,
    completedAt: submission.completedAt?.toISOString() ?? null,
    failedAt: submission.failedAt?.toISOString() ?? null,
    grade: submission.grade
      ? {
          score: Number(submission.grade.score),
          passed: submission.grade.passed,
          autoScore: Number(submission.grade.autoScore),
          manualScore: submission.grade.manualScore ? Number(submission.grade.manualScore) : null,
          summary: submission.grade.summary,
          results: submission.grade.results.map((result) => ({
            id: result.id,
            criterionId: result.criterionId,
            title: result.displayTitle,
            status: result.status,
            scoreEarned: Number(result.scoreEarned),
            maxScore: Number(result.maxScore),
            feedback: result.feedback,
          })),
        }
      : null,
  };
}

function snapshotCriteria(criteria: readonly ProjectRubricCriterion[]): ProjectRubricCriterionPayload[] {
  return criteria.map((criterion) => ({
    id: criterion.id,
    title: criterion.title,
    description: criterion.description,
    type: criterion.type,
    autoCheckType: criterion.autoCheckType,
    config: criterion.configJson as Record<string, unknown> | null,
    weight: Number(criterion.weight),
    required: criterion.required,
    position: criterion.position,
  }));
}

export class ProjectGradingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: ProjectGradingRepository,
    private readonly publisher: ProjectGradingMessagePublisher,
    private readonly env: Env,
    private readonly logger: AppLogger,
    private readonly learningService: LearningService,
    private readonly commitResolver: CommitResolver = new GitCommitResolver(),
    private readonly notificationService?: NotificationService,
  ) {}

  private async createNotification(notification: CreateNotificationInput | null) {
    if (!notification || !this.notificationService) {
      return;
    }

    await this.notificationService.create(notification).catch((error: unknown) => {
      this.logger.warn({ error, type: notification.type, userId: notification.userId }, 'project notification skipped');
    });
  }

  async getConfig(instructorId: string, checkpointId: string) {
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw projectCheckpointNotFound();
    }

    return {
      checkpointId,
      config: checkpoint.projectConfig ? mapConfig(checkpoint.projectConfig) : null,
      criteria: checkpoint.projectConfig?.criteria.map(mapCriterion) ?? [],
    };
  }

  async upsertConfig(instructorId: string, checkpointId: string, input: UpsertProjectConfigInput) {
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw projectCheckpointNotFound();
    }

    if (input.repositoryProvider !== RepositoryProvider.GITHUB) {
      throw projectConfigInvalid('Only GitHub repositories are supported in Phase 8');
    }

    const config = await this.repository.upsertProjectConfig(checkpoint.id, {
      checkpointId: checkpoint.id,
      repositoryProvider: RepositoryProvider.GITHUB,
      defaultBranch: input.defaultBranch ?? checkpoint.projectConfig?.defaultBranch ?? null,
      requireDeploymentUrl: input.requireDeploymentUrl ?? checkpoint.projectConfig?.requireDeploymentUrl ?? false,
      maxRepositoryBytes: BigInt(input.maxRepositoryBytes ?? checkpoint.projectConfig?.maxRepositoryBytes ?? this.env.PROJECT_MAX_REPOSITORY_BYTES),
      maxBuildTimeMs: input.maxBuildTimeMs ?? checkpoint.projectConfig?.maxBuildTimeMs ?? this.env.PROJECT_BUILD_TIMEOUT_MS,
      maxTestTimeMs: input.maxTestTimeMs ?? checkpoint.projectConfig?.maxTestTimeMs ?? this.env.PROJECT_TEST_TIMEOUT_MS,
      passScore: new Prisma.Decimal(input.passScore ?? Number(checkpoint.projectConfig?.passScore ?? 70)),
    });
    const criteria = await this.repository.listCriteria(config.id);

    return { config: mapConfig(config), criteria: criteria.map(mapCriterion) };
  }

  async createCriterion(instructorId: string, checkpointId: string, input: RubricCriterionInput) {
    validateCriterion(input);
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint?.projectConfig) {
      throw projectConfigInvalid('Project config must exist before adding rubric criteria');
    }

    const position = input.position ?? checkpoint.projectConfig.criteria.length + 1;
    const criterion = await this.repository.createCriterion(checkpoint.projectConfig.id, {
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      autoCheckType: input.type === ProjectCriterionType.AUTO ? input.autoCheckType ?? null : null,
      configJson: input.config ? input.config as Prisma.InputJsonValue : Prisma.JsonNull,
      weight: new Prisma.Decimal(input.weight),
      required: input.required,
      position,
    });

    return { criterion: mapCriterion(criterion) };
  }

  async updateCriterion(instructorId: string, criterionId: string, input: RubricCriterionUpdateInput) {
    const criterion = await this.repository.findCriterionForInstructor(instructorId, criterionId);

    if (!criterion) {
      throw projectRubricCriterionNotFound();
    }

    validateCriterion({
      title: input.title ?? criterion.title,
      description: input.description ?? criterion.description,
      type: input.type ?? criterion.type,
      autoCheckType: input.autoCheckType ?? criterion.autoCheckType,
      config: input.config ?? criterion.configJson as { path?: string; jsonPath?: string[] } | null,
      weight: input.weight ?? Number(criterion.weight),
      required: input.required ?? criterion.required,
      position: input.position ?? criterion.position,
    });

    const updated = await this.repository.updateCriterion(criterion.id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.autoCheckType !== undefined ? { autoCheckType: input.autoCheckType } : {}),
      ...(input.config !== undefined ? { configJson: input.config ? input.config as Prisma.InputJsonValue : Prisma.JsonNull } : {}),
      ...(input.weight !== undefined ? { weight: new Prisma.Decimal(input.weight) } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    });

    return { criterion: mapCriterion(updated) };
  }

  async deleteCriterion(instructorId: string, criterionId: string) {
    const criterion = await this.repository.findCriterionForInstructor(instructorId, criterionId);

    if (!criterion) {
      throw projectRubricCriterionNotFound();
    }

    await this.repository.deleteCriterion(criterion.id);
  }

  async reorderCriteria(instructorId: string, checkpointId: string, orderedIds: readonly string[]) {
    const checkpoint = await this.repository.findCheckpointConfigForInstructor(instructorId, checkpointId);

    if (!checkpoint?.projectConfig) {
      throw projectConfigInvalid('Project config must exist before reordering rubric criteria');
    }

    const existingIds = new Set(checkpoint.projectConfig.criteria.map((criterion) => criterion.id));

    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
      throw projectRubricInvalid('Ordered rubric ids must match existing rubric criteria');
    }

    await this.prisma.$transaction(async (transaction) => {
      const repository = new ProjectGradingRepository(transaction);

      for (const [index, id] of orderedIds.entries()) {
        await repository.setCriterionPosition(id, -(index + 1));
      }

      for (const [index, id] of orderedIds.entries()) {
        await repository.setCriterionPosition(id, index + 1);
      }
    });

    const criteria = await this.repository.listCriteria(checkpoint.projectConfig.id);
    return { criteria: criteria.map(mapCriterion) };
  }

  async submitProject(userId: string, checkpointId: string, input: SubmitProjectInput, correlationId: string) {
    const checkpoint = await this.repository.findProjectCheckpointForSubmission(userId, checkpointId);

    if (!checkpoint?.projectConfig) {
      throw projectSubmissionNotAllowed('Project checkpoint is not configured for grading');
    }

    const deploymentUrl = validateDeploymentUrl(input.deploymentUrl);

    if (checkpoint.projectConfig.requireDeploymentUrl && !deploymentUrl) {
      throw projectSubmissionNotAllowed('Deployment URL is required for this project checkpoint');
    }

    const criteria = checkpoint.projectConfig.criteria;

    if (criteria.length === 0 || !criteria.some((criterion) => Number(criterion.weight) > 0)) {
      throw projectSubmissionNotAllowed('Project checkpoint has no gradable rubric criteria');
    }

    const active = await this.repository.countActiveSubmissions(userId, checkpointId);

    if (active >= this.env.PROJECT_MAX_ACTIVE_SUBMISSIONS_PER_USER) {
      throw projectSubmissionActiveLimitExceeded();
    }

    const repository = parseGithubRepositoryUrl(input.repositoryUrl);
    const branch = validateBranch(input.branch ?? checkpoint.projectConfig.defaultBranch ?? 'main');
    const commitSha = await this.commitResolver.resolve({
      owner: repository.owner,
      repo: repository.repo,
      ref: branch,
      timeoutMs: this.env.PROJECT_CLONE_TIMEOUT_MS,
    });
    const now = new Date();
    const snapshot = {
      passScore: Number(checkpoint.projectConfig.passScore),
      requireDeploymentUrl: checkpoint.projectConfig.requireDeploymentUrl,
      maxRepositoryBytes: checkpoint.projectConfig.maxRepositoryBytes.toString(),
      maxBuildTimeMs: checkpoint.projectConfig.maxBuildTimeMs,
      maxTestTimeMs: checkpoint.projectConfig.maxTestTimeMs,
      criteria: snapshotCriteria(criteria),
    };

    const submission = await this.repository.createSubmission({
      userId,
      checkpointId,
      projectCheckpointConfigId: checkpoint.projectConfig.id,
      repositoryUrl: repository.normalizedUrl,
      repositoryProvider: RepositoryProvider.GITHUB,
      repositoryOwner: repository.owner,
      repositoryName: repository.repo,
      branch,
      commitSha,
      deploymentUrl,
      status: ProjectSubmissionStatus.QUEUED,
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId,
      gradingConfigSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      submittedAt: now,
    });

    await this.repository.createSubmittedActivity({
      userId,
      checkpointId,
      submissionId: submission.id,
      lessonId: checkpoint.lessonId,
      courseId: checkpoint.lesson.module.course.id,
      createdAt: now,
    });

    await this.createNotification({
      userId: checkpoint.lesson.module.course.ownerInstructorId,
      type: NotificationType.PROJECT_SUBMITTED,
      category: NotificationCategory.PROJECT,
      title: 'Project submitted',
      message: `${checkpoint.title} received a new project submission.`,
      actionUrl: `/instructor/courses/${checkpoint.lesson.module.course.id}`,
      dedupeKey: `PROJECT_SUBMITTED:${submission.id}:${checkpoint.lesson.module.course.ownerInstructorId}`,
      data: {
        submissionId: submission.id,
        checkpointId,
        courseId: checkpoint.lesson.module.course.id,
      },
    });

    const message: AsyncMessage<ProjectGradingRequestedPayload> = {
      jobId: submission.jobId,
      idempotencyKey: submission.idempotencyKey,
      correlationId,
      requestedByUserId: userId,
      createdAt: now.toISOString(),
      payload: {
        submissionId: submission.id,
        checkpointId,
        repository: {
          provider: 'GITHUB',
          owner: repository.owner,
          name: repository.repo,
          commitSha,
          cloneUrl: trustedGithubCloneUrl(repository.owner, repository.repo),
        },
        branch,
        deploymentUrl,
        limits: {
          maxRepositoryBytes: Number(checkpoint.projectConfig.maxRepositoryBytes),
          cloneTimeoutMs: this.env.PROJECT_CLONE_TIMEOUT_MS,
          gradingTimeoutMs: this.env.PROJECT_GRADING_TIMEOUT_MS,
          buildTimeoutMs: checkpoint.projectConfig.maxBuildTimeMs,
          testTimeoutMs: checkpoint.projectConfig.maxTestTimeMs,
          maxOutputBytes: this.env.PROJECT_MAX_OUTPUT_BYTES,
          cpuLimit: this.env.PROJECT_GRADING_CPU_LIMIT,
          memoryMb: this.env.PROJECT_GRADING_MEMORY_MB,
          pidsLimit: this.env.PROJECT_GRADING_PIDS_LIMIT,
        },
        passScore: Number(checkpoint.projectConfig.passScore),
        criteria: snapshotCriteria(criteria),
      },
    };

    this.publisher.publishProjectGradingRequested(message);
    this.logger.info({ submissionId: submission.id, checkpointId, correlationId }, 'project submission queued');

    return { id: submission.id, status: submission.status, commitSha: submission.commitSha };
  }

  async getSubmission(userId: string, submissionId: string) {
    const submission = await this.repository.findSubmissionForUser(userId, submissionId);

    if (!submission) {
      throw projectSubmissionNotFound();
    }

    return { submission: mapSubmission(submission) };
  }

  async listSubmissions(userId: string, checkpointId: string, query: SubmissionHistoryQuery) {
    const result = await this.repository.listSubmissionsForCheckpoint(userId, checkpointId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      items: result.items.map((submission) => ({
        id: submission.id,
        commitSha: submission.commitSha,
        status: submission.status,
        score: submission.score ? Number(submission.score) : null,
        passed: submission.passed,
        submittedAt: submission.submittedAt.toISOString(),
      })),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async listInstructorSubmissions(instructorId: string, checkpointId: string, query: SubmissionHistoryQuery) {
    const result = await this.repository.listSubmissionsForInstructor(instructorId, checkpointId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      items: result.items.map((submission) => ({
        id: submission.id,
        student: submission.user,
        repositoryOwner: submission.repositoryOwner,
        repositoryName: submission.repositoryName,
        commitSha: submission.commitSha,
        status: submission.status,
        score: submission.score ? Number(submission.score) : null,
        passed: submission.passed,
        manualReviewPending: submission.status === ProjectSubmissionStatus.AWAITING_REVIEW,
        submittedAt: submission.submittedAt.toISOString(),
      })),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async applyManualGrade(instructorId: string, submissionId: string, input: ManualGradeInput) {
    const now = new Date();
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const repository = new ProjectGradingRepository(transaction);
      const submission = await repository.findSubmissionForInstructor(instructorId, submissionId);

      if (!submission?.grade) {
        throw projectSubmissionNotFound();
      }

      if (submission.status !== ProjectSubmissionStatus.AWAITING_REVIEW) {
        throw projectSubmissionNotAllowed('Submission is not awaiting manual review');
      }

      const criteria = submission.projectConfig.criteria.map((criterion) => ({
        id: criterion.id,
        weight: Number(criterion.weight),
        required: criterion.required,
        type: criterion.type,
      }));
      const manualCriteria = submission.projectConfig.criteria.filter((criterion) => criterion.type === ProjectCriterionType.MANUAL);

      for (const grade of input.criteria) {
        const criterion = manualCriteria.find((item) => item.id === grade.criterionId);

        if (!criterion) {
          throw projectRubricInvalid('Manual grade references an invalid manual criterion');
        }

        if (grade.score > Number(criterion.weight)) {
          throw projectRubricInvalid('Manual score cannot exceed criterion weight');
        }

        await transaction.projectRubricResult.updateMany({
          where: { projectGradeId: submission.grade.id, criterionId: criterion.id },
          data: {
            status: grade.score >= Number(criterion.weight) ? ProjectRubricResultStatus.PASSED : ProjectRubricResultStatus.FAILED,
            scoreEarned: new Prisma.Decimal(grade.score),
            feedback: grade.feedback ?? null,
          },
        });
      }

      const currentResults = await transaction.projectRubricResult.findMany({ where: { projectGradeId: submission.grade.id } });
      const stillPending = currentResults.some((result) => result.status === ProjectRubricResultStatus.PENDING_MANUAL);

      if (stillPending) {
        throw projectSubmissionNotAllowed('All manual criteria must be graded before finalizing');
      }

      const score = calculateProjectScore({
        passScore: Number(submission.projectConfig.passScore),
        criteria,
        results: currentResults.map((result) => ({
          criterionId: result.criterionId,
          status: result.status,
          scoreEarned: Number(result.scoreEarned),
        })),
      });
      const manualWeight = manualCriteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0);
      const manualEarned = currentResults
        .filter((result) => manualCriteria.some((criterion) => criterion.id === result.criterionId))
        .reduce((sum, result) => sum + Number(result.scoreEarned), 0);

      return repository.finalizeManualGrade({
        submissionId,
        score: score.score,
        autoScore: Number(submission.grade.autoScore),
        manualScore: manualWeight <= 0 ? 0 : Math.round((manualEarned / manualWeight) * 10_000) / 100,
        passed: score.passed,
        completedAt: now,
      });
    });

    if (outcome.lessonShouldComplete && outcome.studentId && outcome.lessonId) {
      await this.learningService.completeLesson(outcome.studentId, outcome.lessonId);
    }

    await this.createNotification(outcome.notification);

    return this.repository.findSubmissionForUser(outcome.studentId ?? '', submissionId).then((submission) => ({
      submission: submission ? mapSubmission(submission) : null,
    }));
  }

  async markStarted(message: AsyncMessage<ProjectGradingStartedPayload>) {
    await this.repository.markSubmissionStarted(message.payload.submissionId);
  }

  async applyCompleted(message: AsyncMessage<ProjectGradingCompletedPayload>) {
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const repository = new ProjectGradingRepository(transaction);

      return repository.applyCompletedResult({
        submissionId: message.payload.submissionId,
        status: message.payload.manualReviewPending
          ? ProjectSubmissionStatus.AWAITING_REVIEW
          : message.payload.passed ? ProjectSubmissionStatus.PASSED : ProjectSubmissionStatus.FAILED,
        score: message.payload.score,
        autoScore: message.payload.autoScore,
        manualScore: null,
        passed: message.payload.passed,
        summary: message.payload.summary,
        results: message.payload.results.map((result) => ({
          criterionId: result.criterionId,
          displayTitle: result.title,
          status: result.status as ProjectRubricResultStatus,
          scoreEarned: result.scoreEarned,
          maxScore: result.maxScore,
          feedback: result.feedback,
          detailsJson: result.details ? result.details as Prisma.InputJsonValue : Prisma.JsonNull,
        })),
        completedAt: new Date(),
      });
    });

    if (outcome.lessonShouldComplete && outcome.studentId && outcome.lessonId) {
      await this.learningService.completeLesson(outcome.studentId, outcome.lessonId);
    }

    await this.createNotification(outcome.notification);
  }

  async applyTimedOut(message: AsyncMessage<ProjectGradingTimedOutPayload>) {
    await this.repository.markSubmissionFailed({
      submissionId: message.payload.submissionId,
      status: ProjectSubmissionStatus.TIMED_OUT,
      failedAt: new Date(),
    });
  }

  async applyFailed(message: AsyncMessage<ProjectGradingFailedPayload>) {
    await this.repository.markSubmissionFailed({
      submissionId: message.payload.submissionId,
      status: ProjectSubmissionStatus.ERROR,
      failedAt: new Date(),
    });
  }
}
