import type { EnrollmentStatus, LearningActivityType, LessonProgressStatus } from '@prisma/client';

export interface LessonProgressResponse {
  readonly id: string;
  readonly lessonId: string;
  readonly enrollmentId: string;
  readonly status: LessonProgressStatus;
  readonly startedAt: string | null;
  readonly lastAccessedAt: string | null;
  readonly completedAt: string | null;
}

export interface CourseProgressSummary {
  readonly totalLessons: number;
  readonly completedLessons: number;
  readonly progressPercent: number;
  readonly lastAccessedAt: string | null;
  readonly completedAt: string | null;
}

export interface ResumeLearningResponse {
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
  } | null;
  readonly lesson: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly progress: {
    readonly coursePercent: number;
    readonly lessonStatus: LessonProgressStatus | null;
  } | null;
}

export interface CourseLearningSummary {
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
  };
  readonly enrollment: {
    readonly id: string;
    readonly status: EnrollmentStatus;
  };
  readonly progress: CourseProgressSummary;
  readonly lessons: readonly {
    readonly id: string;
    readonly title: string;
    readonly moduleId: string;
    readonly moduleTitle: string;
    readonly position: number;
    readonly status: LessonProgressStatus;
    readonly startedAt: string | null;
    readonly lastAccessedAt: string | null;
    readonly completedAt: string | null;
  }[];
}

export interface LearningActivityResponse {
  readonly id: string;
  readonly type: LearningActivityType;
  readonly course: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly lesson: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly createdAt: string;
}

export interface LearningDashboardResponse {
  readonly activeCourses: number;
  readonly completedCourses: number;
  readonly completedLessons: number;
  readonly resumeLearning: ResumeLearningResponse;
  readonly recentActivity: readonly LearningActivityResponse[];
}
