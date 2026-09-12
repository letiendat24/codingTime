import {
  CourseStatus,
  EnrollmentStatus,
  LearningActivityType,
  LessonProgressStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export class LearningRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findLessonCourse(lessonId: string) {
    return this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            course: true,
          },
        },
      },
    });
  }

  async findEnrollment(studentId: string, courseId: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId,
        status: { not: EnrollmentStatus.CANCELLED },
      },
      include: {
        course: true,
        courseProgress: true,
      },
    });
  }

  async markLessonAccessed(input: {
    readonly studentId: string;
    readonly lessonId: string;
    readonly enrollmentId: string;
    readonly accessedAt: Date;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO "lesson_progress" (
        "studentId",
        "lessonId",
        "enrollmentId",
        "status",
        "startedAt",
        "lastAccessedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${input.studentId}::uuid,
        ${input.lessonId}::uuid,
        ${input.enrollmentId}::uuid,
        'IN_PROGRESS'::"LessonProgressStatus",
        ${input.accessedAt},
        ${input.accessedAt},
        ${input.accessedAt},
        ${input.accessedAt}
      )
      ON CONFLICT ("studentId", "lessonId")
      DO UPDATE SET
        "status" = CASE
          WHEN "lesson_progress"."status" = 'NOT_STARTED'::"LessonProgressStatus"
            THEN 'IN_PROGRESS'::"LessonProgressStatus"
          ELSE "lesson_progress"."status"
        END,
        "startedAt" = COALESCE("lesson_progress"."startedAt", ${input.accessedAt}),
        "lastAccessedAt" = ${input.accessedAt},
        "updatedAt" = ${input.accessedAt}
    `;

    return this.findLessonProgress(input.studentId, input.lessonId);
  }

  async markLessonCompleted(input: {
    readonly studentId: string;
    readonly lessonId: string;
    readonly enrollmentId: string;
    readonly completedAt: Date;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO "lesson_progress" (
        "studentId",
        "lessonId",
        "enrollmentId",
        "status",
        "startedAt",
        "lastAccessedAt",
        "completedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${input.studentId}::uuid,
        ${input.lessonId}::uuid,
        ${input.enrollmentId}::uuid,
        'COMPLETED'::"LessonProgressStatus",
        ${input.completedAt},
        ${input.completedAt},
        ${input.completedAt},
        ${input.completedAt},
        ${input.completedAt}
      )
      ON CONFLICT ("studentId", "lessonId")
      DO UPDATE SET
        "status" = 'COMPLETED'::"LessonProgressStatus",
        "startedAt" = COALESCE("lesson_progress"."startedAt", ${input.completedAt}),
        "lastAccessedAt" = ${input.completedAt},
        "completedAt" = COALESCE("lesson_progress"."completedAt", ${input.completedAt}),
        "updatedAt" = ${input.completedAt}
    `;

    return this.findLessonProgress(input.studentId, input.lessonId);
  }

  async findLessonProgress(studentId: string, lessonId: string) {
    return this.prisma.lessonProgress.findUnique({
      where: {
        studentId_lessonId: {
          studentId,
          lessonId,
        },
      },
    });
  }

  async getCourseCounts(enrollmentId: string, courseId: string) {
    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({
        where: {
          module: {
            courseId,
            course: {
              status: CourseStatus.PUBLISHED,
            },
          },
        },
      }),
      this.prisma.lessonProgress.count({
        where: {
          enrollmentId,
          status: LessonProgressStatus.COMPLETED,
          lesson: {
            module: {
              courseId,
            },
          },
        },
      }),
    ]);

    return { totalLessons, completedLessons };
  }

  async upsertCourseProgress(input: {
    readonly enrollmentId: string;
    readonly totalLessons: number;
    readonly completedLessons: number;
    readonly progressPercent: number;
    readonly lastAccessedAt?: Date;
    readonly completedAt?: Date | null;
  }) {
    const data = {
      totalLessons: input.totalLessons,
      completedLessons: input.completedLessons,
      progressPercent: new Prisma.Decimal(input.progressPercent),
      ...(input.lastAccessedAt !== undefined ? { lastAccessedAt: input.lastAccessedAt } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    };

    return this.prisma.courseProgress.upsert({
      where: { enrollmentId: input.enrollmentId },
      create: {
        enrollmentId: input.enrollmentId,
        startedAt: input.lastAccessedAt ?? new Date(),
        ...data,
      },
      update: data,
    });
  }

  async findCourseProgress(enrollmentId: string) {
    return this.prisma.courseProgress.findUnique({ where: { enrollmentId } });
  }

  async markEnrollmentCompleted(enrollmentId: string) {
    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: EnrollmentStatus.COMPLETED },
    });
  }

  async createActivity(input: {
    readonly userId: string;
    readonly type: LearningActivityType;
    readonly courseId?: string;
    readonly lessonId?: string;
    readonly enrollmentId?: string;
    readonly createdAt: Date;
  }) {
    await this.prisma.learningActivity.createMany({
      data: [
        {
          userId: input.userId,
          type: input.type,
          courseId: input.courseId ?? null,
          lessonId: input.lessonId ?? null,
          enrollmentId: input.enrollmentId ?? null,
          createdAt: input.createdAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  async listHistory(userId: string, input: {
    readonly skip: number;
    readonly take: number;
    readonly courseId?: string;
    readonly type?: LearningActivityType;
  }) {
    const where: Prisma.LearningActivityWhereInput = {
      userId,
      ...(input.courseId ? { courseId: input.courseId } : {}),
      ...(input.type ? { type: input.type } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.learningActivity.findMany({
        where,
        include: {
          course: { select: { id: true, title: true } },
          lesson: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.learningActivity.count({ where }),
    ]);

    return { items, total };
  }

  async findResumeProgress(userId: string) {
    return this.prisma.lessonProgress.findFirst({
      where: {
        studentId: userId,
        enrollment: {
          status: { not: EnrollmentStatus.CANCELLED },
        },
      },
      include: {
        lesson: {
          include: {
            module: {
              include: {
                course: true,
              },
            },
          },
        },
        enrollment: {
          include: {
            courseProgress: true,
          },
        },
      },
      orderBy: { lastAccessedAt: 'desc' },
    });
  }

  async getCourseLearningSummary(studentId: string, courseId: string) {
    return this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId,
        status: { not: EnrollmentStatus.CANCELLED },
      },
      include: {
        course: {
          include: {
            modules: {
              include: {
                lessons: {
                  include: {
                    progress: {
                      where: { studentId },
                    },
                  },
                  orderBy: { position: 'asc' },
                },
              },
              orderBy: { position: 'asc' },
            },
          },
        },
        courseProgress: true,
      },
    });
  }

  async listEnrollmentProgress(userId: string, input: { readonly skip: number; readonly take: number }) {
    const where = { studentId: userId };

    const [items, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        include: {
          course: true,
          courseProgress: true,
        },
        orderBy: { enrolledAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return { items, total };
  }

  async countCompletedLessons(userId: string) {
    return this.prisma.lessonProgress.count({
      where: {
        studentId: userId,
        status: LessonProgressStatus.COMPLETED,
      },
    });
  }

  async countEnrollmentsByStatus(userId: string, status: EnrollmentStatus) {
    return this.prisma.enrollment.count({
      where: {
        studentId: userId,
        status,
      },
    });
  }
}
