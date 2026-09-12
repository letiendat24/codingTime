import type {
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  ExecutionStatus,
  JudgeSubmissionStatus,
  ProjectSubmissionStatus,
  RoleName,
  UserStatus,
  VideoAssetStatus,
  VideoProcessingJobStatus,
} from '@prisma/client';

export interface AdminPagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface AdminPage<T> {
  readonly items: readonly T[];
  readonly pagination: AdminPagination;
}

export interface AdminUserSummary {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly roles: readonly RoleName[];
  readonly status: UserStatus;
  readonly createdAt: string;
  readonly lastActivityAt: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  readonly updatedAt: string;
  readonly activeSessionCount: number;
  readonly enrollmentCount: number;
  readonly ownedCourseCount: number;
  readonly recentActivity: readonly {
    readonly id: string;
    readonly type: string;
    readonly createdAt: string;
    readonly courseTitle: string | null;
    readonly lessonTitle: string | null;
  }[];
}

export interface AdminInstructorSummary {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly roles: readonly RoleName[];
  readonly courseCount: number;
  readonly publishedCourseCount: number;
  readonly enrollmentCount: number;
  readonly createdAt: string;
}

export interface AdminCourseSummary {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly status: CourseStatus;
  readonly difficulty: CourseDifficulty;
  readonly instructor: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
  };
  readonly moduleCount: number;
  readonly lessonCount: number;
  readonly enrollmentCount: number;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}

export interface AdminEnrollmentSummary {
  readonly id: string;
  readonly student: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
  };
  readonly course: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
  };
  readonly status: EnrollmentStatus;
  readonly progressPercent: number | null;
  readonly enrolledAt: string;
  readonly completedAt: string | null;
}

export interface AdminVideoSummary {
  readonly id: string;
  readonly lesson: {
    readonly id: string;
    readonly title: string;
  };
  readonly course: {
    readonly id: string;
    readonly title: string;
  };
  readonly instructor: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
  };
  readonly status: VideoAssetStatus;
  readonly processingProgress: number;
  readonly createdAt: string;
  readonly readyAt: string | null;
  readonly failedAt: string | null;
  readonly latestJob: {
    readonly jobId: string;
    readonly status: VideoProcessingJobStatus;
    readonly attemptCount: number;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  } | null;
}

export interface AdminOperationUser {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

export interface AdminExecutionSummary {
  readonly id: string;
  readonly user: AdminOperationUser;
  readonly status: ExecutionStatus;
  readonly language: string;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface AdminJudgeSubmissionSummary {
  readonly id: string;
  readonly user: AdminOperationUser;
  readonly checkpoint: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly practiceProblem: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
  } | null;
  readonly course: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly status: JudgeSubmissionStatus;
  readonly score: number | null;
  readonly passed: boolean | null;
  readonly createdAt: string;
  readonly durationMs: number | null;
}

export interface AdminProjectSubmissionSummary {
  readonly id: string;
  readonly user: AdminOperationUser;
  readonly checkpoint: {
    readonly id: string;
    readonly title: string;
  };
  readonly course: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly repository: {
    readonly provider: string;
    readonly owner: string;
    readonly name: string;
    readonly url: string;
  };
  readonly commitSha: string;
  readonly status: ProjectSubmissionStatus;
  readonly score: number | null;
  readonly manualReviewPending: boolean;
  readonly submittedAt: string;
  readonly completedAt: string | null;
}

export interface AdminAuditLogSummary {
  readonly id: string;
  readonly admin: AdminOperationUser;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata: unknown;
  readonly createdAt: string;
}
