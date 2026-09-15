import {
  CheckpointProgressStatus,
  CourseStatus,
  EnrollmentStatus,
  LearningActivityType,
  NotificationCategory,
  NotificationType,
  Prisma,
  ProjectRubricResultStatus,
  ProjectSubmissionStatus,
  VideoCheckpointType,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function inactiveProjectOutcome(studentId: string | null = null, lessonId: string | null = null) {
  return {
    lessonShouldComplete: false,
    lessonId,
    studentId,
    notification: null,
  };
}

export class ProjectGradingRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findCheckpointConfigForInstructor(instructorId: string, checkpointId: string) {
    return this.prisma.videoCheckpoint.findFirst({
      where: {
        id: checkpointId,
        type: VideoCheckpointType.PROJECT,
        lesson: { module: { course: { ownerInstructorId: instructorId } } },
      },
      include: {
        projectConfig: {
          include: { criteria: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
        },
      },
    });
  }

  async upsertProjectConfig(checkpointId: string, data: Prisma.ProjectCheckpointConfigUncheckedCreateInput) {
    const updateData: Prisma.ProjectCheckpointConfigUncheckedUpdateInput = {
      repositoryProvider: data.repositoryProvider ?? 'GITHUB',
      defaultBranch: data.defaultBranch ?? null,
      requireDeploymentUrl: data.requireDeploymentUrl as boolean,
      maxRepositoryBytes: data.maxRepositoryBytes as bigint,
      maxBuildTimeMs: data.maxBuildTimeMs as number,
      maxTestTimeMs: data.maxTestTimeMs as number,
      passScore: data.passScore as Prisma.Decimal,
    };

    return this.prisma.projectCheckpointConfig.upsert({
      where: { checkpointId },
      create: data,
      update: updateData,
      include: { criteria: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  async createCriterion(configId: string, data: Omit<Prisma.ProjectRubricCriterionUncheckedCreateInput, 'projectCheckpointConfigId'>) {
    return this.prisma.projectRubricCriterion.create({ data: { ...data, projectCheckpointConfigId: configId } });
  }

  async findCriterionForInstructor(instructorId: string, criterionId: string) {
    return this.prisma.projectRubricCriterion.findFirst({
      where: {
        id: criterionId,
        projectConfig: {
          checkpoint: {
            lesson: { module: { course: { ownerInstructorId: instructorId } } },
          },
        },
      },
      include: { projectConfig: true },
    });
  }

  async updateCriterion(criterionId: string, data: Prisma.ProjectRubricCriterionUpdateInput) {
    return this.prisma.projectRubricCriterion.update({ where: { id: criterionId }, data });
  }

  async deleteCriterion(criterionId: string) {
    await this.prisma.projectRubricCriterion.delete({ where: { id: criterionId } });
  }

  async listCriteria(configId: string) {
    return this.prisma.projectRubricCriterion.findMany({
      where: { projectCheckpointConfigId: configId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async setCriterionPosition(criterionId: string, position: number) {
    await this.prisma.projectRubricCriterion.update({ where: { id: criterionId }, data: { position } });
  }

  async findProjectCheckpointForSubmission(userId: string, checkpointId: string) {
    return this.prisma.videoCheckpoint.findFirst({
      where: {
        id: checkpointId,
        type: VideoCheckpointType.PROJECT,
        lesson: {
          module: {
            course: {
              status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
              enrollments: { some: { studentId: userId, status: { not: EnrollmentStatus.CANCELLED } } },
            },
          },
        },
      },
      include: {
        projectConfig: {
          include: { criteria: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
        },
        lesson: {
          include: {
            module: {
              include: {
                course: {
                  include: { enrollments: { where: { studentId: userId, status: { not: EnrollmentStatus.CANCELLED } }, take: 1 } },
                },
              },
            },
          },
        },
        videoAsset: true,
      },
    });
  }

  async countActiveSubmissions(userId: string, checkpointId: string) {
    return this.prisma.projectSubmission.count({
      where: {
        userId,
        checkpointId,
        status: { in: [ProjectSubmissionStatus.QUEUED, ProjectSubmissionStatus.CLONING, ProjectSubmissionStatus.GRADING] },
      },
    });
  }

  async createSubmission(data: Prisma.ProjectSubmissionUncheckedCreateInput) {
    return this.prisma.projectSubmission.create({ data });
  }

  async findSubmissionForUser(userId: string, submissionId: string) {
    return this.prisma.projectSubmission.findFirst({
      where: { id: submissionId, userId },
      include: {
        grade: { include: { results: { orderBy: { createdAt: 'asc' } } } },
      },
    });
  }

  async listSubmissionsForCheckpoint(userId: string, checkpointId: string, input: { readonly skip: number; readonly take: number }) {
    const where = { checkpointId, userId };
    const [items, total] = await Promise.all([
      this.prisma.projectSubmission.findMany({
        where,
        include: { grade: true },
        orderBy: { submittedAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.projectSubmission.count({ where }),
    ]);

    return { items, total };
  }

  async listSubmissionsForInstructor(instructorId: string, checkpointId: string, input: { readonly skip: number; readonly take: number }) {
    const where = {
      checkpointId,
      checkpoint: { lesson: { module: { course: { ownerInstructorId: instructorId } } } },
    };
    const [items, total] = await Promise.all([
      this.prisma.projectSubmission.findMany({
        where,
        include: { user: { select: { id: true, email: true, displayName: true } }, grade: true },
        orderBy: { submittedAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.projectSubmission.count({ where }),
    ]);

    return { items, total };
  }

  async findSubmissionForInstructor(instructorId: string, submissionId: string) {
    return this.prisma.projectSubmission.findFirst({
      where: {
        id: submissionId,
        checkpoint: { lesson: { module: { course: { ownerInstructorId: instructorId } } } },
      },
      include: {
        projectConfig: { include: { criteria: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } },
        grade: { include: { results: true } },
      },
    });
  }

  async markSubmissionStarted(submissionId: string) {
    await this.prisma.projectSubmission.updateMany({
      where: { id: submissionId, status: ProjectSubmissionStatus.QUEUED },
      data: { status: ProjectSubmissionStatus.GRADING, startedAt: new Date() },
    });
  }

  async createSubmittedActivity(input: {
    readonly userId: string;
    readonly checkpointId: string;
    readonly submissionId: string;
    readonly lessonId: string;
    readonly courseId: string;
    readonly createdAt: Date;
  }) {
    await this.prisma.learningActivity.create({
      data: {
        userId: input.userId,
        type: LearningActivityType.PROJECT_SUBMITTED,
        courseId: input.courseId,
        lessonId: input.lessonId,
        metadata: { checkpointId: input.checkpointId, submissionId: input.submissionId },
        createdAt: input.createdAt,
      },
    });
  }

  async applyCompletedResult(input: {
    readonly submissionId: string;
    readonly status: ProjectSubmissionStatus;
    readonly score: number;
    readonly autoScore: number;
    readonly manualScore: number | null;
    readonly passed: boolean;
    readonly summary: string | null;
    readonly results: readonly {
      readonly criterionId: string;
      readonly displayTitle: string;
      readonly status: ProjectRubricResultStatus;
      readonly scoreEarned: number;
      readonly maxScore: number;
      readonly feedback: string | null;
      readonly detailsJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    }[];
    readonly completedAt: Date;
  }) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: input.submissionId },
      include: {
        checkpoint: {
          include: {
            lesson: { include: { module: { include: { course: true } } } },
          },
        },
      },
    });

    if (!submission) {
      return inactiveProjectOutcome();
    }

    const existing = await this.prisma.projectGrade.findUnique({ where: { submissionId: input.submissionId } });

    if (existing) {
      return inactiveProjectOutcome(submission.userId, submission.checkpoint.lessonId);
    }

    const grade = await this.prisma.projectGrade.create({
      data: {
        submissionId: input.submissionId,
        score: new Prisma.Decimal(input.score),
        passed: input.passed,
        autoScore: new Prisma.Decimal(input.autoScore),
        manualScore: input.manualScore === null ? null : new Prisma.Decimal(input.manualScore),
        summary: input.summary,
      },
    });

    await this.prisma.projectRubricResult.createMany({
      data: input.results.map((result) => ({
        projectGradeId: grade.id,
        criterionId: result.criterionId,
        displayTitle: result.displayTitle,
        status: result.status,
        scoreEarned: new Prisma.Decimal(result.scoreEarned),
        maxScore: new Prisma.Decimal(result.maxScore),
        feedback: result.feedback,
        detailsJson: result.detailsJson,
      })),
      skipDuplicates: true,
    });

    await this.prisma.projectSubmission.update({
      where: { id: input.submissionId },
      data: {
        status: input.status,
        score: new Prisma.Decimal(input.score),
        passed: input.status === ProjectSubmissionStatus.AWAITING_REVIEW ? null : input.passed,
        completedAt: input.status === ProjectSubmissionStatus.AWAITING_REVIEW ? null : input.completedAt,
        ...(input.status === ProjectSubmissionStatus.TIMED_OUT || input.status === ProjectSubmissionStatus.ERROR ? { failedAt: input.completedAt } : {}),
      },
    });

    if (!input.passed || input.status === ProjectSubmissionStatus.AWAITING_REVIEW) {
      return {
        ...inactiveProjectOutcome(submission.userId, submission.checkpoint.lessonId),
        notification: input.status === ProjectSubmissionStatus.AWAITING_REVIEW ? {
          userId: submission.checkpoint.lesson.module.course.ownerInstructorId,
          type: NotificationType.PROJECT_MANUAL_REVIEW_REQUIRED,
          category: NotificationCategory.PROJECT,
          title: 'Project needs manual review',
          message: `${submission.checkpoint.title} is awaiting manual review.`,
          actionUrl: `/instructor/courses/${submission.checkpoint.lesson.module.course.id}`,
          dedupeKey: `PROJECT_MANUAL_REVIEW_REQUIRED:${input.submissionId}:${submission.checkpoint.lesson.module.course.ownerInstructorId}`,
          data: {
            submissionId: input.submissionId,
            checkpointId: submission.checkpointId,
            courseId: submission.checkpoint.lesson.module.course.id,
            score: input.score,
          },
        } : {
          userId: submission.userId,
          type: NotificationType.PROJECT_GRADED,
          category: NotificationCategory.PROJECT,
          title: 'Project graded',
          message: `${submission.checkpoint.title} was graded with score ${input.score}.`,
          actionUrl: `/courses/${submission.checkpoint.lesson.module.course.slug}/learn`,
          dedupeKey: `PROJECT_GRADED:${input.submissionId}:${submission.userId}`,
          data: {
            submissionId: input.submissionId,
            checkpointId: submission.checkpointId,
            courseId: submission.checkpoint.lesson.module.course.id,
            score: input.score,
            passed: input.passed,
          },
        },
      };
    }

    const outcome = await this.completeProjectCheckpoint(submission.userId, submission.checkpointId, input.submissionId, input.completedAt);

    return {
      ...outcome,
      notification: {
        userId: submission.userId,
        type: NotificationType.PROJECT_GRADED,
        category: NotificationCategory.PROJECT,
        title: 'Project graded',
        message: `${submission.checkpoint.title} was graded with score ${input.score}.`,
        actionUrl: `/courses/${submission.checkpoint.lesson.module.course.slug}/learn`,
        dedupeKey: `PROJECT_GRADED:${input.submissionId}:${submission.userId}`,
        data: {
          submissionId: input.submissionId,
          checkpointId: submission.checkpointId,
          courseId: submission.checkpoint.lesson.module.course.id,
          score: input.score,
          passed: input.passed,
        },
      },
    };
  }

  async finalizeManualGrade(input: {
    readonly submissionId: string;
    readonly score: number;
    readonly autoScore: number;
    readonly manualScore: number;
    readonly passed: boolean;
    readonly completedAt: Date;
  }) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: input.submissionId },
      include: { checkpoint: { include: { lesson: { include: { module: { include: { course: true } } } } } } },
    });

    if (!submission) {
      return inactiveProjectOutcome();
    }

    await this.prisma.projectGrade.update({
      where: { submissionId: input.submissionId },
      data: {
        score: new Prisma.Decimal(input.score),
        autoScore: new Prisma.Decimal(input.autoScore),
        manualScore: new Prisma.Decimal(input.manualScore),
        passed: input.passed,
      },
    });
    await this.prisma.projectSubmission.update({
      where: { id: input.submissionId },
      data: {
        status: input.passed ? ProjectSubmissionStatus.PASSED : ProjectSubmissionStatus.FAILED,
        score: new Prisma.Decimal(input.score),
        passed: input.passed,
        completedAt: input.completedAt,
      },
    });

    if (!input.passed) {
      return {
        ...inactiveProjectOutcome(submission.userId, submission.checkpoint.lessonId),
        notification: {
          userId: submission.userId,
          type: NotificationType.PROJECT_GRADED,
          category: NotificationCategory.PROJECT,
          title: 'Project graded',
          message: `${submission.checkpoint.title} was graded with score ${input.score}.`,
          actionUrl: `/courses/${submission.checkpoint.lesson.module.course.slug}/learn`,
          dedupeKey: `PROJECT_GRADED:${input.submissionId}:${submission.userId}`,
          data: {
            submissionId: input.submissionId,
            checkpointId: submission.checkpointId,
            courseId: submission.checkpoint.lesson.module.course.id,
            score: input.score,
            passed: input.passed,
          },
        },
      };
    }

    const outcome = await this.completeProjectCheckpoint(submission.userId, submission.checkpointId, input.submissionId, input.completedAt);

    return {
      ...outcome,
      notification: {
        userId: submission.userId,
        type: NotificationType.PROJECT_GRADED,
        category: NotificationCategory.PROJECT,
        title: 'Project graded',
        message: `${submission.checkpoint.title} was graded with score ${input.score}.`,
        actionUrl: `/courses/${submission.checkpoint.lesson.module.course.slug}/learn`,
        dedupeKey: `PROJECT_GRADED:${input.submissionId}:${submission.userId}`,
        data: {
          submissionId: input.submissionId,
          checkpointId: submission.checkpointId,
          courseId: submission.checkpoint.lesson.module.course.id,
          score: input.score,
          passed: input.passed,
        },
      },
    };
  }

  async markSubmissionFailed(input: {
    readonly submissionId: string;
    readonly status: typeof ProjectSubmissionStatus.ERROR | typeof ProjectSubmissionStatus.TIMED_OUT;
    readonly failedAt: Date;
  }) {
    await this.prisma.projectSubmission.updateMany({
      where: { id: input.submissionId, status: { in: [ProjectSubmissionStatus.QUEUED, ProjectSubmissionStatus.CLONING, ProjectSubmissionStatus.GRADING] } },
      data: { status: input.status, failedAt: input.failedAt },
    });
  }

  private async completeProjectCheckpoint(userId: string, checkpointId: string, submissionId: string, completedAt: Date) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { checkpoint: { include: { lesson: { include: { module: { include: { course: true } } } } } } },
    });

    if (!submission) {
      return inactiveProjectOutcome();
    }

    const previous = await this.prisma.checkpointProgress.findUnique({
      where: { studentId_checkpointId: { studentId: userId, checkpointId } },
    });

    await this.prisma.checkpointProgress.upsert({
      where: { studentId_checkpointId: { studentId: userId, checkpointId } },
      create: { studentId: userId, checkpointId, status: CheckpointProgressStatus.COMPLETED, startedAt: completedAt, completedAt },
      update: { status: CheckpointProgressStatus.COMPLETED, completedAt: previous?.completedAt ?? completedAt },
    });

    if (previous?.status !== CheckpointProgressStatus.COMPLETED) {
      await this.prisma.learningActivity.create({
        data: {
          userId,
          type: LearningActivityType.PROJECT_PASSED,
          courseId: submission.checkpoint.lesson.module.course.id,
          lessonId: submission.checkpoint.lessonId,
          metadata: { checkpointId, submissionId },
          createdAt: completedAt,
        },
      });
    }

    if (!submission.checkpoint.videoAssetId) {
      return {
        lessonShouldComplete: true,
        lessonId: submission.checkpoint.lessonId,
        studentId: userId,
      };
    }

    const required = await this.prisma.videoCheckpoint.count({ where: { videoAssetId: submission.checkpoint.videoAssetId, required: true } });
    const completed = await this.prisma.videoCheckpoint.count({
      where: {
        videoAssetId: submission.checkpoint.videoAssetId,
        required: true,
        progress: { some: { studentId: userId, status: CheckpointProgressStatus.COMPLETED } },
      },
    });
    const videoProgress = await this.prisma.videoProgress.findUnique({
      where: { studentId_videoAssetId: { studentId: userId, videoAssetId: submission.checkpoint.videoAssetId } },
    });

    return {
      lessonShouldComplete: Boolean(videoProgress?.completedAt) && completed >= required,
      lessonId: submission.checkpoint.lessonId,
      studentId: userId,
    };
  }
}
