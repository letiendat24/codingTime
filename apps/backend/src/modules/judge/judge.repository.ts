import {
  CheckpointProgressStatus,
  CourseStatus,
  EnrollmentStatus,
  JudgeSubmissionStatus,
  LearningActivityType,
  LessonType,
  NotificationCategory,
  NotificationType,
  PracticeProblemStatus,
  PracticeProgressStatus,
  Prisma,
  ScoringMode,
  TestCaseVisibility,
  TestCaseResultStatus,
  VideoAssetStatus,
  VideoCheckpointType,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function inactiveJudgeOutcome(studentId: string | null = null, lessonId: string | null = null) {
  return {
    completedCheckpoint: false,
    lessonShouldComplete: false,
    lessonId,
    studentId,
    notification: null,
    practiceSolvedNotification: null,
  };
}

export class JudgeRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findCheckpointConfigForInstructor(instructorId: string, checkpointId: string) {
    return this.prisma.videoCheckpoint.findFirst({
      where: {
        id: checkpointId,
        type: VideoCheckpointType.CODING,
        videoAsset: { lesson: { module: { course: { ownerInstructorId: instructorId } } } },
      },
      include: {
        codingConfig: {
          include: {
            testCases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
          },
        },
      },
    });
  }

  async upsertCodingConfig(checkpointId: string, data: Prisma.CodingCheckpointConfigUncheckedCreateInput) {
    return this.prisma.codingCheckpointConfig.upsert({
      where: { checkpointId },
      create: data,
      update: {
        language: data.language,
        entryFile: data.entryFile,
        starterFilesJson: data.starterFilesJson,
        timeLimitMs: data.timeLimitMs as number,
        memoryLimitMb: data.memoryLimitMb as number,
        passScore: data.passScore as Prisma.Decimal,
        scoringMode: data.scoringMode as ScoringMode,
      },
      include: { testCases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  async createTestCase(configId: string, data: Omit<Prisma.TestCaseUncheckedCreateInput, 'codingCheckpointConfigId'>) {
    return this.prisma.testCase.create({ data: { ...data, codingCheckpointConfigId: configId } });
  }

  async findTestCaseForInstructor(instructorId: string, testCaseId: string) {
    return this.prisma.testCase.findFirst({
      where: {
        id: testCaseId,
        codingConfig: {
          checkpoint: {
            videoAsset: { lesson: { module: { course: { ownerInstructorId: instructorId } } } },
          },
        },
      },
      include: { codingConfig: true },
    });
  }

  async updateTestCase(testCaseId: string, data: Prisma.TestCaseUpdateInput) {
    return this.prisma.testCase.update({ where: { id: testCaseId }, data });
  }

  async deleteTestCase(testCaseId: string) {
    await this.prisma.testCase.delete({ where: { id: testCaseId } });
  }

  async listTestCases(configId: string) {
    return this.prisma.testCase.findMany({
      where: { codingCheckpointConfigId: configId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async setTestCasePosition(testCaseId: string, position: number) {
    await this.prisma.testCase.update({ where: { id: testCaseId }, data: { position } });
  }

  async findWorkspaceForSubmission(userId: string, workspaceId: string) {
    return this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userId,
        checkpointId: { not: null },
        checkpoint: {
          type: VideoCheckpointType.CODING,
          videoAsset: {
            status: VideoAssetStatus.READY,
            lesson: {
              lessonType: LessonType.VIDEO,
              module: {
                course: {
                  status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
                  enrollments: { some: { studentId: userId, status: { not: EnrollmentStatus.CANCELLED } } },
                },
              },
            },
          },
        },
      },
      include: {
        files: { orderBy: { path: 'asc' } },
        checkpoint: {
          include: {
            codingConfig: {
              include: { testCases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
            },
            videoAsset: {
              include: {
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
              },
            },
          },
        },
      },
    });
  }

  async findPracticeWorkspaceForSubmission(userId: string, problemId: string) {
    return this.prisma.workspace.findFirst({
      where: {
        userId,
        practiceProblemId: problemId,
        practiceProblem: { status: PracticeProblemStatus.PUBLISHED },
      },
      include: {
        files: { orderBy: { path: 'asc' } },
        practiceProblem: {
          include: { testCases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
        },
      },
    });
  }

  async countActiveSubmissions(userId: string) {
    return this.prisma.judgeSubmission.count({
      where: { userId, status: { in: [JudgeSubmissionStatus.QUEUED, JudgeSubmissionStatus.RUNNING] } },
    });
  }

  async createSubmission(data: Prisma.JudgeSubmissionUncheckedCreateInput) {
    return this.prisma.judgeSubmission.create({ data });
  }

  async findSubmissionForUser(userId: string, submissionId: string) {
    return this.prisma.judgeSubmission.findFirst({
      where: { id: submissionId, userId },
      include: {
        result: {
          include: {
            testResults: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
  }

  async listSubmissionsForWorkspace(userId: string, workspaceId: string, input: { readonly skip: number; readonly take: number }) {
    const where = { workspaceId, userId };
    const [items, total] = await Promise.all([
      this.prisma.judgeSubmission.findMany({
        where,
        include: { result: true },
        orderBy: { submittedAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.judgeSubmission.count({ where }),
    ]);

    return { items, total };
  }

  async markSubmissionStarted(submissionId: string, startedAt: Date) {
    await this.prisma.judgeSubmission.updateMany({
      where: { id: submissionId, status: JudgeSubmissionStatus.QUEUED },
      data: { status: JudgeSubmissionStatus.RUNNING, startedAt },
    });
  }

  async applyCompletedResult(input: {
    readonly submissionId: string;
    readonly status: JudgeSubmissionStatus;
    readonly totalScore: number;
    readonly maxScore: number;
    readonly passed: boolean;
    readonly totalTests: number;
    readonly passedTests: number;
    readonly durationMs: number;
    readonly peakMemoryBytes: bigint | null;
    readonly testResults: readonly {
      readonly testCaseId: string;
      readonly displayName: string;
      readonly visibility: TestCaseVisibility;
      readonly status: TestCaseResultStatus;
      readonly scoreEarned: number;
      readonly actualOutput: string | null;
      readonly stderr: string | null;
      readonly durationMs: number;
      readonly memoryBytes: bigint | null;
    }[];
    readonly completedAt: Date;
  }) {
    const submission = await this.prisma.judgeSubmission.findUnique({
      where: { id: input.submissionId },
      include: {
        checkpoint: {
          include: {
            videoAsset: { include: { lesson: { include: { module: { include: { course: true } } } } } },
          },
        },
        practiceProblem: true,
      },
    });

    if (!submission) {
      return inactiveJudgeOutcome();
    }

    const existingResult = await this.prisma.judgeResult.findUnique({ where: { submissionId: input.submissionId } });

    if (existingResult) {
      return inactiveJudgeOutcome(submission.userId, submission.checkpoint?.lessonId ?? null);
    }

    const result = await this.prisma.judgeResult.create({
      data: {
        submissionId: input.submissionId,
        totalScore: new Prisma.Decimal(input.totalScore),
        maxScore: new Prisma.Decimal(input.maxScore),
        passed: input.passed,
        totalTests: input.totalTests,
        passedTests: input.passedTests,
        durationMs: input.durationMs,
        peakMemoryBytes: input.peakMemoryBytes,
      },
    });

    await this.prisma.testCaseResult.createMany({
      data: input.testResults.map((resultRow) => ({
        judgeResultId: result.id,
        testCaseId: submission.practiceProblemId ? null : resultRow.testCaseId,
        displayName: resultRow.displayName,
        visibility: resultRow.visibility,
        status: resultRow.status,
        scoreEarned: new Prisma.Decimal(resultRow.scoreEarned),
        actualOutput: resultRow.actualOutput,
        stderr: resultRow.stderr,
        durationMs: resultRow.durationMs,
        memoryBytes: resultRow.memoryBytes,
      })),
      skipDuplicates: true,
    });

    await this.prisma.judgeSubmission.update({
      where: { id: input.submissionId },
      data: {
        status: input.status,
        score: new Prisma.Decimal(input.totalScore),
        passed: input.passed,
        completedAt: input.completedAt,
        ...(input.status === JudgeSubmissionStatus.TIMED_OUT ? { failedAt: input.completedAt } : {}),
      },
    });

    let completedCheckpoint = false;

    if (submission.practiceProblemId) {
      const previous = await this.prisma.practiceProgress.findUnique({
        where: { studentId_practiceProblemId: { studentId: submission.userId, practiceProblemId: submission.practiceProblemId } },
      });
      const nextStatus = input.passed ? PracticeProgressStatus.SOLVED : previous?.status === PracticeProgressStatus.SOLVED ? PracticeProgressStatus.SOLVED : PracticeProgressStatus.ATTEMPTED;
      const previousBest = previous?.bestScore ? Number(previous.bestScore) : null;
      const bestScore = previousBest === null ? input.totalScore : Math.max(previousBest, input.totalScore);

      await this.prisma.practiceProgress.upsert({
        where: { studentId_practiceProblemId: { studentId: submission.userId, practiceProblemId: submission.practiceProblemId } },
        create: {
          studentId: submission.userId,
          practiceProblemId: submission.practiceProblemId,
          status: nextStatus,
          attemptCount: 1,
          bestScore: new Prisma.Decimal(bestScore),
          firstAttemptedAt: input.completedAt,
          lastAttemptedAt: input.completedAt,
          solvedAt: input.passed ? input.completedAt : null,
        },
        update: {
          status: nextStatus,
          attemptCount: { increment: 1 },
          bestScore: new Prisma.Decimal(bestScore),
          firstAttemptedAt: previous?.firstAttemptedAt ?? input.completedAt,
          lastAttemptedAt: input.completedAt,
          solvedAt: input.passed ? previous?.solvedAt ?? input.completedAt : previous?.solvedAt ?? null,
        },
      });

      await this.prisma.learningActivity.create({
        data: {
          userId: submission.userId,
          type: LearningActivityType.PRACTICE_ATTEMPTED,
          metadata: { practiceProblemId: submission.practiceProblemId, submissionId: input.submissionId },
          createdAt: input.completedAt,
        },
      });

      if (input.passed && previous?.status !== PracticeProgressStatus.SOLVED) {
        await this.prisma.learningActivity.create({
          data: {
            userId: submission.userId,
            type: LearningActivityType.PRACTICE_SOLVED,
            metadata: { practiceProblemId: submission.practiceProblemId, submissionId: input.submissionId },
            createdAt: input.completedAt,
          },
        });
      }

      return {
        ...inactiveJudgeOutcome(submission.userId),
        notification: {
          userId: submission.userId,
          type: NotificationType.JUDGE_COMPLETED,
          category: NotificationCategory.PRACTICE,
          title: input.passed ? 'Practice submission accepted' : 'Practice submission completed',
          message: `${submission.practiceProblem?.title ?? 'Practice problem'} was judged with score ${input.totalScore}.`,
          actionUrl: submission.practiceProblem?.slug ? `/practice/${submission.practiceProblem.slug}` : '/practice',
          dedupeKey: `JUDGE_COMPLETED:${input.submissionId}:${submission.userId}`,
          data: {
            submissionId: input.submissionId,
            practiceProblemId: submission.practiceProblemId,
            score: input.totalScore,
            passed: input.passed,
          },
        },
        practiceSolvedNotification: input.passed && previous?.status !== PracticeProgressStatus.SOLVED ? {
          userId: submission.userId,
          type: NotificationType.PRACTICE_SOLVED,
          category: NotificationCategory.PRACTICE,
          title: 'Practice problem solved',
          message: `${submission.practiceProblem?.title ?? 'Practice problem'} is now solved.`,
          actionUrl: submission.practiceProblem?.slug ? `/practice/${submission.practiceProblem.slug}` : '/practice',
          dedupeKey: `PRACTICE_SOLVED:${submission.userId}:${submission.practiceProblemId}`,
          data: {
            submissionId: input.submissionId,
            practiceProblemId: submission.practiceProblemId,
          },
        } : null,
      };
    }

    if (!submission.checkpointId || !submission.checkpoint) {
      return inactiveJudgeOutcome(submission.userId);
    }

    if (input.passed) {
      const previous = await this.prisma.checkpointProgress.findUnique({
        where: { studentId_checkpointId: { studentId: submission.userId, checkpointId: submission.checkpointId } },
      });

      await this.prisma.checkpointProgress.upsert({
        where: { studentId_checkpointId: { studentId: submission.userId, checkpointId: submission.checkpointId } },
        create: {
          studentId: submission.userId,
          checkpointId: submission.checkpointId,
          status: CheckpointProgressStatus.COMPLETED,
          startedAt: input.completedAt,
          completedAt: input.completedAt,
        },
        update: {
          status: CheckpointProgressStatus.COMPLETED,
          completedAt: previous?.completedAt ?? input.completedAt,
        },
      });
      completedCheckpoint = previous?.status !== CheckpointProgressStatus.COMPLETED;

      if (completedCheckpoint) {
        await this.prisma.learningActivity.create({
          data: {
            userId: submission.userId,
            type: LearningActivityType.CODING_PASSED,
            courseId: submission.checkpoint.videoAsset.lesson.module.course.id,
            lessonId: submission.checkpoint.lessonId,
            metadata: { checkpointId: submission.checkpointId, submissionId: input.submissionId },
            createdAt: input.completedAt,
          },
        });
      }
    }

    const required = await this.prisma.videoCheckpoint.count({
      where: { videoAssetId: submission.checkpoint.videoAssetId, required: true },
    });
    const completed = await this.prisma.videoCheckpoint.count({
      where: {
        videoAssetId: submission.checkpoint.videoAssetId,
        required: true,
        progress: { some: { studentId: submission.userId, status: CheckpointProgressStatus.COMPLETED } },
      },
    });
    const videoProgress = await this.prisma.videoProgress.findUnique({
      where: { studentId_videoAssetId: { studentId: submission.userId, videoAssetId: submission.checkpoint.videoAssetId } },
    });

    return {
      completedCheckpoint,
      lessonShouldComplete: Boolean(videoProgress?.completedAt) && completed >= required,
      lessonId: submission.checkpoint.lessonId,
      studentId: submission.userId,
      notification: {
        userId: submission.userId,
        type: NotificationType.JUDGE_COMPLETED,
        category: NotificationCategory.LEARNING,
        title: input.passed ? 'Coding checkpoint passed' : 'Coding checkpoint judged',
        message: `${submission.checkpoint.title} was judged with score ${input.totalScore}.`,
        actionUrl: `/courses/${submission.checkpoint.videoAsset.lesson.module.course.slug}/learn`,
        dedupeKey: `JUDGE_COMPLETED:${input.submissionId}:${submission.userId}`,
        data: {
          submissionId: input.submissionId,
          checkpointId: submission.checkpointId,
          lessonId: submission.checkpoint.lessonId,
          courseId: submission.checkpoint.videoAsset.lesson.module.course.id,
          score: input.totalScore,
          passed: input.passed,
        },
      },
      practiceSolvedNotification: null,
    };
  }

  async markSubmissionFailed(input: {
    readonly submissionId: string;
    readonly failedAt: Date;
    readonly errorCode: string;
  }) {
    await this.prisma.judgeSubmission.updateMany({
      where: { id: input.submissionId, status: { in: [JudgeSubmissionStatus.QUEUED, JudgeSubmissionStatus.RUNNING] } },
      data: { status: JudgeSubmissionStatus.FAILED, failedAt: input.failedAt },
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
        type: LearningActivityType.CODING_SUBMITTED,
        courseId: input.courseId,
        lessonId: input.lessonId,
        metadata: { checkpointId: input.checkpointId, submissionId: input.submissionId },
        createdAt: input.createdAt,
      },
    });
  }
}
