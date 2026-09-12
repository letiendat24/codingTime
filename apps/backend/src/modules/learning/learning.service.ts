import {
  EnrollmentStatus,
  LearningActivityType,
  LessonProgressStatus,
  type CourseProgress,
  type LessonProgress,
  type PrismaClient,
} from '@prisma/client';
import {
  learningLessonNotFound,
  learningLessonNotInCourse,
  learningNotEnrolled,
} from './learning.errors';
import { paginationMeta } from '../../shared/pagination';
import { LearningRepository } from './learning.repository';
import type { LearningHistoryQuery } from './learning.schemas';
import type {
  CourseLearningSummary,
  CourseProgressSummary,
  LearningActivityResponse,
  LearningDashboardResponse,
  LessonProgressResponse,
  ResumeLearningResponse,
} from './learning.types';

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toPercent(totalLessons: number, completedLessons: number) {
  if (totalLessons <= 0) {
    return 0;
  }

  return Math.round((completedLessons / totalLessons) * 10000) / 100;
}

function mapLessonProgress(progress: LessonProgress): LessonProgressResponse {
  return {
    id: progress.id,
    lessonId: progress.lessonId,
    enrollmentId: progress.enrollmentId,
    status: progress.status,
    startedAt: toIso(progress.startedAt),
    lastAccessedAt: toIso(progress.lastAccessedAt),
    completedAt: toIso(progress.completedAt),
  };
}

function mapCourseProgress(progress: CourseProgress | null): CourseProgressSummary {
  return {
    totalLessons: progress?.totalLessons ?? 0,
    completedLessons: progress?.completedLessons ?? 0,
    progressPercent: progress ? Number(progress.progressPercent) : 0,
    lastAccessedAt: toIso(progress?.lastAccessedAt),
    completedAt: toIso(progress?.completedAt),
  };
}

function mapActivity(item: Awaited<ReturnType<LearningRepository['listHistory']>>['items'][number]): LearningActivityResponse {
  return {
    id: item.id,
    type: item.type,
    course: item.course ? { id: item.course.id, title: item.course.title } : null,
    lesson: item.lesson ? { id: item.lesson.id, title: item.lesson.title } : null,
    createdAt: item.createdAt.toISOString(),
  };
}

export class LearningService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly learning: LearningRepository,
  ) {}

  async recordCourseEnrolled(input: {
    readonly studentId: string;
    readonly courseId: string;
    readonly enrollmentId: string;
  }) {
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const repository = new LearningRepository(transaction);
      const counts = await repository.getCourseCounts(input.enrollmentId, input.courseId);

      await repository.upsertCourseProgress({
        enrollmentId: input.enrollmentId,
        totalLessons: counts.totalLessons,
        completedLessons: counts.completedLessons,
        progressPercent: toPercent(counts.totalLessons, counts.completedLessons),
      });
      await repository.createActivity({
        userId: input.studentId,
        type: LearningActivityType.COURSE_ENROLLED,
        courseId: input.courseId,
        enrollmentId: input.enrollmentId,
        createdAt: now,
      });
    });
  }

  async accessLesson(studentId: string, lessonId: string): Promise<LessonProgressResponse> {
    const now = new Date();

    const progress = await this.prisma.$transaction(async (transaction) => {
      const repository = new LearningRepository(transaction);
      const context = await this.requireLearningContext(repository, studentId, lessonId);
      const lessonProgress = await repository.markLessonAccessed({
        studentId,
        lessonId,
        enrollmentId: context.enrollment.id,
        accessedAt: now,
      });

      if (!lessonProgress) {
        throw learningLessonNotFound();
      }

      await this.recalculateCourseProgress(repository, {
        enrollmentId: context.enrollment.id,
        courseId: context.courseId,
        accessedAt: now,
      });
      await repository.createActivity({
        userId: studentId,
        type: LearningActivityType.LESSON_STARTED,
        courseId: context.courseId,
        lessonId,
        enrollmentId: context.enrollment.id,
        createdAt: now,
      });

      return lessonProgress;
    });

    return mapLessonProgress(progress);
  }

  async completeLesson(studentId: string, lessonId: string): Promise<LessonProgressResponse> {
    const now = new Date();

    const progress = await this.prisma.$transaction(async (transaction) => {
      const repository = new LearningRepository(transaction);
      const context = await this.requireLearningContext(repository, studentId, lessonId);
      const existing = await repository.findLessonProgress(studentId, lessonId);
      const wasAlreadyCompleted = existing?.status === LessonProgressStatus.COMPLETED;
      const lessonProgress = await repository.markLessonCompleted({
        studentId,
        lessonId,
        enrollmentId: context.enrollment.id,
        completedAt: now,
      });

      if (!lessonProgress) {
        throw learningLessonNotFound();
      }

      await repository.createActivity({
        userId: studentId,
        type: LearningActivityType.LESSON_STARTED,
        courseId: context.courseId,
        lessonId,
        enrollmentId: context.enrollment.id,
        createdAt: now,
      });

      if (!wasAlreadyCompleted) {
        await repository.createActivity({
          userId: studentId,
          type: LearningActivityType.LESSON_COMPLETED,
          courseId: context.courseId,
          lessonId,
          enrollmentId: context.enrollment.id,
          createdAt: now,
        });
      }

      const courseCompleted = await this.recalculateCourseProgress(repository, {
        enrollmentId: context.enrollment.id,
        courseId: context.courseId,
        accessedAt: now,
      });

      if (courseCompleted) {
        await repository.markEnrollmentCompleted(context.enrollment.id);
        await repository.createActivity({
          userId: studentId,
          type: LearningActivityType.COURSE_COMPLETED,
          courseId: context.courseId,
          enrollmentId: context.enrollment.id,
          createdAt: now,
        });
      }

      return lessonProgress;
    });

    return mapLessonProgress(progress);
  }

  async getResumeLearning(studentId: string): Promise<ResumeLearningResponse> {
    const progress = await this.learning.findResumeProgress(studentId);

    if (!progress) {
      return { course: null, lesson: null, progress: null };
    }

    return {
      course: {
        id: progress.lesson.module.course.id,
        title: progress.lesson.module.course.title,
        slug: progress.lesson.module.course.slug,
      },
      lesson: {
        id: progress.lesson.id,
        title: progress.lesson.title,
      },
      progress: {
        coursePercent: progress.enrollment.courseProgress ? Number(progress.enrollment.courseProgress.progressPercent) : 0,
        lessonStatus: progress.status,
      },
    };
  }

  async getCourseProgress(studentId: string, courseId: string): Promise<CourseLearningSummary> {
    const enrollment = await this.learning.getCourseLearningSummary(studentId, courseId);

    if (!enrollment) {
      throw learningNotEnrolled();
    }

    const progress = enrollment.courseProgress;

    return {
      course: {
        id: enrollment.course.id,
        title: enrollment.course.title,
        slug: enrollment.course.slug,
      },
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
      },
      progress: mapCourseProgress(progress),
      lessons: enrollment.course.modules.flatMap((module) =>
        module.lessons.map((lesson) => {
          const lessonProgress = lesson.progress[0];

          return {
            id: lesson.id,
            title: lesson.title,
            moduleId: module.id,
            moduleTitle: module.title,
            position: lesson.position,
            status: lessonProgress?.status ?? LessonProgressStatus.NOT_STARTED,
            startedAt: toIso(lessonProgress?.startedAt),
            lastAccessedAt: toIso(lessonProgress?.lastAccessedAt),
            completedAt: toIso(lessonProgress?.completedAt),
          };
        }),
      ),
    };
  }

  async listHistory(studentId: string, query: LearningHistoryQuery) {
    const result = await this.learning.listHistory(studentId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.type ? { type: query.type } : {}),
    });

    return {
      items: result.items.map(mapActivity),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async getDashboard(studentId: string): Promise<LearningDashboardResponse> {
    const [activeCourses, completedCourses, completedLessons, resumeLearning, recentActivity] = await Promise.all([
      this.learning.countEnrollmentsByStatus(studentId, EnrollmentStatus.ACTIVE),
      this.learning.countEnrollmentsByStatus(studentId, EnrollmentStatus.COMPLETED),
      this.learning.countCompletedLessons(studentId),
      this.getResumeLearning(studentId),
      this.learning.listHistory(studentId, { skip: 0, take: 5 }),
    ]);

    return {
      activeCourses,
      completedCourses,
      completedLessons,
      resumeLearning,
      recentActivity: recentActivity.items.map(mapActivity),
    };
  }

  async listEnrollmentProgress(studentId: string, input: { readonly page: number; readonly limit: number }) {
    const result = await this.learning.listEnrollmentProgress(studentId, {
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });

    return {
      items: result.items.map((item) => ({
        enrollmentId: item.id,
        status: item.status,
        enrolledAt: item.enrolledAt.toISOString(),
        progressPercent: item.courseProgress ? Number(item.courseProgress.progressPercent) : 0,
        completedLessons: item.courseProgress?.completedLessons ?? 0,
        totalLessons: item.courseProgress?.totalLessons ?? 0,
        lastAccessedAt: toIso(item.courseProgress?.lastAccessedAt),
        course: {
          id: item.course.id,
          title: item.course.title,
          slug: item.course.slug,
          status: item.course.status,
        },
      })),
      pagination: paginationMeta({ page: input.page, limit: input.limit, total: result.total }),
    };
  }

  private async requireLearningContext(repository: LearningRepository, studentId: string, lessonId: string) {
    const lesson = await repository.findLessonCourse(lessonId);

    if (!lesson) {
      throw learningLessonNotFound();
    }

    const courseId = lesson.module.courseId;
    const enrollment = await repository.findEnrollment(studentId, courseId);

    if (!enrollment) {
      throw learningNotEnrolled();
    }

    if (lesson.module.courseId !== enrollment.courseId) {
      throw learningLessonNotInCourse();
    }

    return { courseId, enrollment };
  }

  private async recalculateCourseProgress(repository: LearningRepository, input: {
    readonly enrollmentId: string;
    readonly courseId: string;
    readonly accessedAt: Date;
  }) {
    const existing = await repository.findCourseProgress(input.enrollmentId);
    const counts = await repository.getCourseCounts(input.enrollmentId, input.courseId);
    const progressPercent = toPercent(counts.totalLessons, counts.completedLessons);
    const shouldComplete = counts.totalLessons > 0 && counts.completedLessons === counts.totalLessons;
    await repository.upsertCourseProgress({
      enrollmentId: input.enrollmentId,
      totalLessons: counts.totalLessons,
      completedLessons: counts.completedLessons,
      progressPercent,
      lastAccessedAt: input.accessedAt,
      ...(shouldComplete ? { completedAt: input.accessedAt } : {}),
    });

    return shouldComplete && !existing?.completedAt;
  }
}
