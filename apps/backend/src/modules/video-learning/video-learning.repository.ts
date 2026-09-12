import {
  CheckpointProgressStatus,
  CourseStatus,
  EnrollmentStatus,
  LearningActivityType,
  LessonType,
  VideoAssetStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export class VideoLearningRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findReadyVideoForStudent(studentId: string, videoAssetId: string) {
    return this.prisma.videoAsset.findFirst({
      where: {
        id: videoAssetId,
        status: VideoAssetStatus.READY,
        lesson: {
          lessonType: LessonType.VIDEO,
          module: {
            course: {
              status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
              enrollments: {
                some: {
                  studentId,
                  status: { not: EnrollmentStatus.CANCELLED },
                },
              },
            },
          },
        },
      },
      include: {
        lesson: {
          include: {
            module: {
              include: {
                course: {
                  include: {
                    enrollments: {
                      where: { studentId, status: { not: EnrollmentStatus.CANCELLED } },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
        progress: { where: { studentId }, take: 1 },
        checkpoints: {
          include: { progress: { where: { studentId }, take: 1 } },
          orderBy: [{ timestampSeconds: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
        },
        codeSnapshots: {
          orderBy: [{ timestampSeconds: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async findReadyVideoByLessonForStudent(studentId: string, lessonId: string) {
    return this.prisma.videoAsset.findFirst({
      where: {
        lessonId,
        status: VideoAssetStatus.READY,
        lesson: {
          lessonType: LessonType.VIDEO,
          module: {
            course: {
              status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
              enrollments: {
                some: {
                  studentId,
                  status: { not: EnrollmentStatus.CANCELLED },
                },
              },
            },
          },
        },
      },
      include: {
        progress: { where: { studentId }, take: 1 },
        checkpoints: {
          include: { progress: { where: { studentId }, take: 1 } },
          orderBy: [{ timestampSeconds: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
        },
        codeSnapshots: {
          orderBy: [{ timestampSeconds: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async findVideoForInstructor(instructorId: string, videoAssetId: string) {
    return this.prisma.videoAsset.findFirst({
      where: {
        id: videoAssetId,
        lesson: {
          module: {
            course: {
              ownerInstructorId: instructorId,
            },
          },
        },
      },
      include: {
        lesson: true,
      },
    });
  }

  async findVideoLessonForInstructor(instructorId: string, lessonId: string) {
    return this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        lessonType: LessonType.VIDEO,
        module: { course: { ownerInstructorId: instructorId } },
      },
      include: {
        videoAsset: true,
        codeAlongConfig: true,
      },
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
      },
      include: {
        videoAsset: {
          include: { codeSnapshots: { orderBy: [{ timestampSeconds: 'asc' }, { createdAt: 'asc' }] } },
        },
        codeAlongConfig: true,
        workspaces: {
          where: { userId: studentId, checkpointId: null, practiceProblemId: null },
          take: 1,
        },
      },
    });
  }

  async upsertCodeAlongConfig(lessonId: string, data: Prisma.VideoCodeAlongConfigUncheckedCreateInput) {
    return this.prisma.videoCodeAlongConfig.upsert({
      where: { lessonId },
      create: data,
      update: {
        enabled: data.enabled as boolean,
        language: data.language,
        entryFile: data.entryFile ?? null,
      },
    });
  }

  async findCheckpointForInstructor(instructorId: string, checkpointId: string) {
    return this.prisma.videoCheckpoint.findFirst({
      where: {
        id: checkpointId,
        videoAsset: {
          lesson: {
            module: {
              course: { ownerInstructorId: instructorId },
            },
          },
        },
      },
    });
  }

  async listCheckpointsForInstructor(instructorId: string, videoAssetId: string) {
    return this.prisma.videoCheckpoint.findMany({
      where: {
        videoAssetId,
        videoAsset: {
          lesson: {
            module: {
              course: { ownerInstructorId: instructorId },
            },
          },
        },
      },
      orderBy: [{ timestampSeconds: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createCheckpoint(input: Prisma.VideoCheckpointUncheckedCreateInput) {
    return this.prisma.videoCheckpoint.create({ data: input });
  }

  async updateCheckpoint(checkpointId: string, data: Prisma.VideoCheckpointUpdateInput) {
    return this.prisma.videoCheckpoint.update({ where: { id: checkpointId }, data });
  }

  async deleteCheckpoint(checkpointId: string) {
    await this.prisma.videoCheckpoint.delete({ where: { id: checkpointId } });
  }

  async findCheckpointForStudent(studentId: string, checkpointId: string) {
    return this.prisma.videoCheckpoint.findFirst({
      where: {
        id: checkpointId,
        videoAsset: {
          status: VideoAssetStatus.READY,
          lesson: {
            module: {
              course: {
                status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
                enrollments: {
                  some: {
                    studentId,
                    status: { not: EnrollmentStatus.CANCELLED },
                  },
                },
              },
            },
          },
        },
      },
      include: {
        videoAsset: true,
      },
    });
  }

  async findCheckpointProgress(studentId: string, checkpointId: string) {
    return this.prisma.checkpointProgress.findUnique({
      where: {
        studentId_checkpointId: {
          studentId,
          checkpointId,
        },
      },
    });
  }

  async upsertCheckpointCompleted(input: {
    readonly studentId: string;
    readonly checkpointId: string;
    readonly completedAt: Date;
  }) {
    await this.prisma.checkpointProgress.upsert({
      where: {
        studentId_checkpointId: {
          studentId: input.studentId,
          checkpointId: input.checkpointId,
        },
      },
      create: {
        studentId: input.studentId,
        checkpointId: input.checkpointId,
        status: CheckpointProgressStatus.COMPLETED,
        startedAt: input.completedAt,
        completedAt: input.completedAt,
      },
      update: {
        status: CheckpointProgressStatus.COMPLETED,
        startedAt: input.completedAt,
        completedAt: input.completedAt,
      },
    });
  }

  async findVideoProgress(studentId: string, videoAssetId: string) {
    return this.prisma.videoProgress.findUnique({
      where: { studentId_videoAssetId: { studentId, videoAssetId } },
    });
  }

  async upsertVideoProgress(input: {
    readonly studentId: string;
    readonly videoAssetId: string;
    readonly lessonId: string;
    readonly positionSeconds: number;
    readonly watchedPercent: number;
    readonly completedAt?: Date;
    readonly now: Date;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO "video_progress" (
        "studentId",
        "videoAssetId",
        "lessonId",
        "lastPositionSeconds",
        "furthestPositionSeconds",
        "watchedPercent",
        "startedAt",
        "lastWatchedAt",
        "completedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${input.studentId}::uuid,
        ${input.videoAssetId}::uuid,
        ${input.lessonId}::uuid,
        ${input.positionSeconds},
        ${input.positionSeconds},
        ${input.watchedPercent},
        ${input.now},
        ${input.now},
        ${input.completedAt ?? null},
        ${input.now},
        ${input.now}
      )
      ON CONFLICT ("studentId", "videoAssetId")
      DO UPDATE SET
        "lastPositionSeconds" = GREATEST("video_progress"."lastPositionSeconds", ${input.positionSeconds}),
        "furthestPositionSeconds" = GREATEST("video_progress"."furthestPositionSeconds", ${input.positionSeconds}),
        "watchedPercent" = GREATEST("video_progress"."watchedPercent", ${input.watchedPercent}),
        "lastWatchedAt" = ${input.now},
        "completedAt" = COALESCE("video_progress"."completedAt", ${input.completedAt ?? null}),
        "updatedAt" = ${input.now}
    `;

    return this.findVideoProgress(input.studentId, input.videoAssetId);
  }

  async countRequiredCheckpoints(videoAssetId: string) {
    return this.prisma.videoCheckpoint.count({ where: { videoAssetId, required: true } });
  }

  async countCompletedRequiredCheckpoints(studentId: string, videoAssetId: string) {
    return this.prisma.videoCheckpoint.count({
      where: {
        videoAssetId,
        required: true,
        progress: {
          some: {
            studentId,
            status: CheckpointProgressStatus.COMPLETED,
          },
        },
      },
    });
  }

  async findActivity(input: {
    readonly userId: string;
    readonly type: LearningActivityType;
    readonly lessonId?: string;
    readonly enrollmentId?: string;
  }) {
    return this.prisma.learningActivity.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        lessonId: input.lessonId ?? null,
        enrollmentId: input.enrollmentId ?? null,
      },
    });
  }

  async createActivity(input: {
    readonly userId: string;
    readonly type: LearningActivityType;
    readonly courseId?: string;
    readonly lessonId?: string;
    readonly enrollmentId?: string;
    readonly metadata?: Prisma.InputJsonValue;
    readonly createdAt: Date;
  }) {
    await this.prisma.learningActivity.create({
      data: {
        userId: input.userId,
        type: input.type,
        courseId: input.courseId ?? null,
        lessonId: input.lessonId ?? null,
        enrollmentId: input.enrollmentId ?? null,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        createdAt: input.createdAt,
      },
    });
  }

  async findSnapshotForInstructor(instructorId: string, snapshotId: string) {
    return this.prisma.codeSnapshot.findFirst({
      where: {
        id: snapshotId,
        videoAsset: {
          lesson: {
            module: {
              course: { ownerInstructorId: instructorId },
            },
          },
        },
      },
    });
  }

  async listSnapshotsForInstructor(instructorId: string, videoAssetId: string) {
    return this.prisma.codeSnapshot.findMany({
      where: {
        videoAssetId,
        videoAsset: {
          lesson: {
            module: {
              course: { ownerInstructorId: instructorId },
            },
          },
        },
      },
      orderBy: [{ timestampSeconds: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createSnapshot(input: Prisma.CodeSnapshotUncheckedCreateInput) {
    return this.prisma.codeSnapshot.create({ data: input });
  }

  async updateSnapshot(snapshotId: string, data: Prisma.CodeSnapshotUpdateInput) {
    return this.prisma.codeSnapshot.update({ where: { id: snapshotId }, data });
  }

  async deleteSnapshot(snapshotId: string) {
    await this.prisma.codeSnapshot.delete({ where: { id: snapshotId } });
  }

  async findSnapshotForStudent(studentId: string, snapshotId: string) {
    return this.prisma.codeSnapshot.findFirst({
      where: {
        id: snapshotId,
        videoAsset: {
          status: VideoAssetStatus.READY,
          lesson: {
            module: {
              course: {
                status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
                enrollments: {
                  some: {
                    studentId,
                    status: { not: EnrollmentStatus.CANCELLED },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
