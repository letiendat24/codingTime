import type { CourseStatus, EnrollmentStatus } from '@prisma/client';

export interface EnrollmentCourseSummary {
  readonly enrollmentId: string;
  readonly status: EnrollmentStatus;
  readonly enrolledAt: string;
  readonly progressPercent?: number;
  readonly completedLessons?: number;
  readonly totalLessons?: number;
  readonly lastAccessedAt?: string | null;
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    readonly status: CourseStatus;
  };
}
