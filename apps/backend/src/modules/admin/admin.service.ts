import {
  CourseStatus,
  Prisma,
  RoleName,
  UserStatus,
  type PrismaClient,
} from '@prisma/client';
import type { ReadinessChecker } from '../../infrastructure/readiness';
import { paginationMeta } from '../../shared/pagination';
import type { AppLogger } from '../../shared/logger';
import type { VideoService } from '../videos/video.service';
import {
  adminCourseArchiveDenied,
  adminInvalidStatusTransition,
  adminLastActiveAdminDenied,
  adminSelfRoleChangeDenied,
  adminSelfStatusChangeDenied,
  adminTargetNotFound,
} from './admin.errors';
import { AdminRepository, type AdminAuditRecord, type AdminCourseRecord, type AdminExecutionRecord, type AdminJudgeRecord, type AdminProjectRecord, type AdminUserRecord, type AdminVideoRecord } from './admin.repository';
import type {
  AdminAuditLogListQuery,
  AdminCourseListQuery,
  AdminEnrollmentListQuery,
  AdminExecutionListQuery,
  AdminInstructorListQuery,
  AdminJudgeSubmissionListQuery,
  AdminPeriodQuery,
  AdminProjectSubmissionListQuery,
  AdminUserListQuery,
  AdminVideoListQuery,
  UpdateUserRolesInput,
  UpdateUserStatusInput,
} from './admin.schemas';
import type {
  AdminAuditLogSummary,
  AdminCourseSummary,
  AdminExecutionSummary,
  AdminInstructorSummary,
  AdminJudgeSubmissionSummary,
  AdminPage,
  AdminProjectSubmissionSummary,
  AdminUserDetail,
  AdminUserSummary,
  AdminVideoSummary,
} from './admin.types';

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function numberOrNull(value: Prisma.Decimal | number | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function rolesOf(user: AdminUserRecord) {
  return user.roles.map((userRole) => userRole.role.name);
}

function courseOfCheckpoint(record: AdminJudgeRecord | AdminProjectRecord) {
  if (!record.checkpoint) {
    return null;
  }
  const course = record.checkpoint.lesson.module.course;
  return course ? { id: course.id, title: course.title } : null;
}

function periodStart(period: AdminPeriodQuery['period']) {
  const now = Date.now();
  const hours = period === '24h' ? 24 : period === '7d' ? 24 * 7 : 24 * 30;
  return new Date(now - hours * 60 * 60 * 1000);
}

function safeUser(user: { readonly id: string; readonly displayName: string; readonly email: string }) {
  return { id: user.id, displayName: user.displayName, email: user.email };
}

function mapUserSummary(user: AdminUserRecord): AdminUserSummary {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    roles: rolesOf(user),
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastActivityAt: null,
  };
}

function mapCourseSummary(course: AdminCourseRecord): AdminCourseSummary {
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    status: course.status,
    difficulty: course.difficulty,
    instructor: safeUser(course.ownerInstructor),
    moduleCount: course._count.modules,
    lessonCount: course.modules.reduce((total, module) => total + module.lessons.length, 0),
    enrollmentCount: course._count.enrollments,
    createdAt: course.createdAt.toISOString(),
    publishedAt: toIso(course.publishedAt),
  };
}

function mapVideo(video: AdminVideoRecord): AdminVideoSummary {
  const course = video.lesson.module.course;
  const latestJob = video.jobs[0];
  const latestFailure = video.failures[0];

  return {
    id: video.id,
    lesson: { id: video.lesson.id, title: video.lesson.title },
    course: { id: course.id, title: course.title },
    instructor: safeUser(course.ownerInstructor),
    status: video.status,
    processingProgress: video.processingProgress,
    createdAt: video.createdAt.toISOString(),
    readyAt: toIso(video.readyAt),
    failedAt: toIso(video.failedAt),
    latestJob: latestJob
      ? {
          jobId: latestJob.jobId,
          status: latestJob.status,
          attemptCount: latestJob.attemptCount,
          errorCode: latestJob.lastErrorCode ?? latestFailure?.errorCode ?? null,
          errorMessage: latestJob.lastErrorMessage ?? latestFailure?.errorMessage ?? null,
        }
      : null,
  };
}

function mapExecution(execution: AdminExecutionRecord): AdminExecutionSummary {
  return {
    id: execution.id,
    user: safeUser(execution.user),
    status: execution.status,
    language: execution.language,
    durationMs: execution.result?.durationMs ?? null,
    createdAt: execution.createdAt.toISOString(),
    completedAt: toIso(execution.completedAt),
  };
}

function mapJudge(submission: AdminJudgeRecord): AdminJudgeSubmissionSummary {
  return {
    id: submission.id,
    user: safeUser(submission.user),
    checkpoint: submission.checkpoint ? { id: submission.checkpoint.id, title: submission.checkpoint.title } : null,
    practiceProblem: submission.practiceProblem
      ? { id: submission.practiceProblem.id, title: submission.practiceProblem.title, slug: submission.practiceProblem.slug }
      : null,
    course: courseOfCheckpoint(submission),
    status: submission.status,
    score: numberOrNull(submission.score),
    passed: submission.passed,
    createdAt: submission.createdAt.toISOString(),
    durationMs: submission.result?.durationMs ?? null,
  };
}

function mapProject(submission: AdminProjectRecord): AdminProjectSubmissionSummary {
  return {
    id: submission.id,
    user: safeUser(submission.user),
    checkpoint: { id: submission.checkpoint.id, title: submission.checkpoint.title },
    course: courseOfCheckpoint(submission),
    repository: {
      provider: submission.repositoryProvider,
      owner: submission.repositoryOwner,
      name: submission.repositoryName,
      url: submission.repositoryUrl,
    },
    commitSha: submission.commitSha,
    status: submission.status,
    score: numberOrNull(submission.score),
    manualReviewPending: submission.status === 'AWAITING_REVIEW',
    submittedAt: submission.submittedAt.toISOString(),
    completedAt: toIso(submission.completedAt),
  };
}

function mapAudit(log: AdminAuditRecord): AdminAuditLogSummary {
  return {
    id: log.id,
    admin: safeUser(log.adminUser),
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: log.metadataJson,
    createdAt: log.createdAt.toISOString(),
  };
}

export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly admin: AdminRepository,
    private readonly readinessChecker: ReadinessChecker,
    private readonly videoService: VideoService,
    private readonly logger: AppLogger,
  ) {}

  async getDashboard(query: AdminPeriodQuery) {
    const since = periodStart(query.period);
    const [users, courses, learning, operations, recentActivity, readiness] = await Promise.all([
      this.admin.countUsers(),
      this.admin.countCourses(),
      this.admin.countLearning(),
      this.admin.countOperations(since),
      this.admin.listRecentActivity(10),
      this.readinessChecker(),
    ]);

    return {
      period: query.period,
      users,
      courses,
      learning,
      operations,
      health: readiness,
      recentActivity: recentActivity.map((activity) => ({
        id: activity.id,
        type: activity.type,
        user: safeUser(activity.user),
        course: activity.course ? { id: activity.course.id, title: activity.course.title } : null,
        lesson: activity.lesson ? { id: activity.lesson.id, title: activity.lesson.title } : null,
        createdAt: activity.createdAt.toISOString(),
      })),
    };
  }

  async listUsers(query: AdminUserListQuery): Promise<AdminPage<AdminUserSummary>> {
    const result = await this.admin.listUsers(query);
    return { items: result.items.map(mapUserSummary), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async getUser(userId: string): Promise<AdminUserDetail> {
    const user = await this.admin.findUserDetail(userId);
    if (!user) {
      throw adminTargetNotFound('User not found');
    }

    return {
      ...mapUserSummary(user),
      updatedAt: user.updatedAt.toISOString(),
      activeSessionCount: user._count.sessions,
      enrollmentCount: user._count.enrollments,
      ownedCourseCount: user._count.ownedCourses,
      recentActivity: user.learningActivities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        createdAt: activity.createdAt.toISOString(),
        courseTitle: activity.course?.title ?? null,
        lessonTitle: activity.lesson?.title ?? null,
      })),
    };
  }

  async updateUserStatus(adminUserId: string, targetUserId: string, input: UpdateUserStatusInput) {
    if (adminUserId === targetUserId) {
      throw adminSelfStatusChangeDenied();
    }

    if (![UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DISABLED].includes(input.status)) {
      throw adminInvalidStatusTransition();
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const repository = new AdminRepository(transaction);
      const user = await repository.findUserDetail(targetUserId);

      if (!user) {
        throw adminTargetNotFound('User not found');
      }

      if (rolesOf(user).includes(RoleName.ADMIN) && input.status !== UserStatus.ACTIVE) {
        const remainingAdmins = await repository.countActiveAdminsExcluding(targetUserId);
        if (remainingAdmins === 0) {
          throw adminLastActiveAdminDenied();
        }
      }

      const changed = await repository.updateUserStatus(targetUserId, input.status);
      if (input.status !== UserStatus.ACTIVE) {
        await repository.revokeActiveSessions(targetUserId);
      }
      await repository.createAuditLog({
        adminUserId,
        action: input.status === UserStatus.ACTIVE ? 'USER_ACTIVATED' : input.status === UserStatus.SUSPENDED ? 'USER_SUSPENDED' : 'USER_DISABLED',
        targetType: 'USER',
        targetId: targetUserId,
        metadataJson: {
          previousStatus: user.status,
          newStatus: input.status,
          reason: input.reason ?? null,
        },
      });
      return changed;
    });

    this.logger.info({ adminUserId, targetId: targetUserId, action: 'USER_STATUS_CHANGED' }, 'admin user status changed');
    return mapUserSummary(updated);
  }

  async updateUserRoles(adminUserId: string, targetUserId: string, input: UpdateUserRolesInput) {
    if (adminUserId === targetUserId) {
      throw adminSelfRoleChangeDenied();
    }

    const uniqueRoles = [...new Set(input.roles)];
    const updated = await this.prisma.$transaction(async (transaction) => {
      const repository = new AdminRepository(transaction);
      const user = await repository.findUserDetail(targetUserId);

      if (!user) {
        throw adminTargetNotFound('User not found');
      }

      const previousRoles = rolesOf(user);
      if (user.status === UserStatus.ACTIVE && previousRoles.includes(RoleName.ADMIN) && !uniqueRoles.includes(RoleName.ADMIN)) {
        const remainingAdmins = await repository.countActiveAdminsExcluding(targetUserId);
        if (remainingAdmins === 0) {
          throw adminLastActiveAdminDenied();
        }
      }

      const roleRecords = await repository.roleIdsByName(uniqueRoles);
      if (roleRecords.length !== uniqueRoles.length) {
        throw adminTargetNotFound('Role not found');
      }

      await repository.replaceUserRoles(targetUserId, roleRecords.map((role) => role.id));
      await repository.revokeActiveSessions(targetUserId);
      await repository.createAuditLog({
        adminUserId,
        action: 'USER_ROLES_CHANGED',
        targetType: 'USER',
        targetId: targetUserId,
        metadataJson: {
          previousRoles,
          newRoles: uniqueRoles,
          reason: input.reason ?? null,
        },
      });

      const refreshed = await repository.findUserDetail(targetUserId);
      if (!refreshed) {
        throw adminTargetNotFound('User not found');
      }
      return refreshed;
    });

    this.logger.info({ adminUserId, targetId: targetUserId, action: 'USER_ROLES_CHANGED' }, 'admin user roles changed');
    return mapUserSummary(updated);
  }

  async listInstructors(query: AdminInstructorListQuery): Promise<AdminPage<AdminInstructorSummary>> {
    const result = await this.admin.listInstructors(query);
    return {
      items: result.items.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        roles: rolesOf(user),
        courseCount: user.ownedCourses.length,
        publishedCourseCount: user.ownedCourses.filter((course) => course.status === CourseStatus.PUBLISHED).length,
        enrollmentCount: user.ownedCourses.reduce((total, course) => total + course._count.enrollments, 0),
        createdAt: user.createdAt.toISOString(),
      })),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async getInstructor(userId: string) {
    const user = await this.getUser(userId);
    if (!user.roles.includes(RoleName.INSTRUCTOR)) {
      throw adminTargetNotFound('Instructor not found');
    }
    const courses = await this.admin.listCourses({ page: 1, limit: 20, instructorId: userId });
    return { instructor: user, courses: courses.items.map(mapCourseSummary) };
  }

  async listCourses(query: AdminCourseListQuery): Promise<AdminPage<AdminCourseSummary>> {
    const result = await this.admin.listCourses(query);
    return { items: result.items.map(mapCourseSummary), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async getCourse(courseId: string) {
    const course = await this.admin.findCourseDetail(courseId);
    if (!course) {
      throw adminTargetNotFound('Course not found');
    }

    return {
      course: {
        ...mapCourseSummary(course),
        shortDescription: course.shortDescription,
        description: course.description,
        category: { id: course.category.id, name: course.category.name, slug: course.category.slug },
        tags: course.tags.map((tag) => ({ id: tag.tag.id, name: tag.tag.name, slug: tag.tag.slug })),
        archivedAt: toIso(course.archivedAt),
        modules: course.modules.map((module) => ({
          id: module.id,
          title: module.title,
          position: module.position,
          lessons: module.lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            lessonType: lesson.lessonType,
            position: lesson.position,
            videoStatus: lesson.videoAsset?.status ?? null,
          })),
        })),
        recentEnrollments: course.enrollments.map((enrollment) => ({
          id: enrollment.id,
          student: safeUser(enrollment.student),
          status: enrollment.status,
          progressPercent: numberOrNull(enrollment.courseProgress?.progressPercent),
          enrolledAt: enrollment.enrolledAt.toISOString(),
        })),
      },
    };
  }

  async archiveCourse(adminUserId: string, courseId: string, reason?: string) {
    const archived = await this.prisma.$transaction(async (transaction) => {
      const repository = new AdminRepository(transaction);
      const course = await repository.findCourseDetail(courseId);

      if (!course) {
        throw adminTargetNotFound('Course not found');
      }

      if (course.status === CourseStatus.ARCHIVED) {
        throw adminCourseArchiveDenied();
      }

      const changed = await repository.archiveCourse(courseId);
      await repository.createAuditLog({
        adminUserId,
        action: 'COURSE_ARCHIVED',
        targetType: 'COURSE',
        targetId: courseId,
        metadataJson: {
          previousStatus: course.status,
          newStatus: CourseStatus.ARCHIVED,
          reason: reason ?? null,
          ownerInstructorId: course.ownerInstructorId,
        },
      });
      return changed;
    });

    this.logger.info({ adminUserId, targetId: courseId, action: 'COURSE_ARCHIVED' }, 'admin course archived');
    return mapCourseSummary(archived);
  }

  async listEnrollments(query: AdminEnrollmentListQuery) {
    const result = await this.admin.listEnrollments(query);
    return {
      items: result.items.map((enrollment) => ({
        id: enrollment.id,
        student: safeUser(enrollment.student),
        course: { id: enrollment.course.id, title: enrollment.course.title, slug: enrollment.course.slug },
        status: enrollment.status,
        progressPercent: numberOrNull(enrollment.courseProgress?.progressPercent),
        enrolledAt: enrollment.enrolledAt.toISOString(),
        completedAt: toIso(enrollment.courseProgress?.completedAt),
      })),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async listVideos(query: AdminVideoListQuery): Promise<AdminPage<AdminVideoSummary>> {
    const result = await this.admin.listVideos(query);
    return { items: result.items.map(mapVideo), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async getVideo(videoAssetId: string) {
    const video = await this.admin.findVideo(videoAssetId);
    if (!video) {
      throw adminTargetNotFound('Video not found');
    }
    return { video: mapVideo(video) };
  }

  async retryVideo(adminUserId: string, videoAssetId: string, correlationId: string) {
    const video = await this.videoService.retryAsAdmin(adminUserId, videoAssetId, correlationId);
    await this.admin.createAuditLog({
      adminUserId,
      action: 'VIDEO_RETRY_REQUESTED',
      targetType: 'VIDEO_ASSET',
      targetId: videoAssetId,
      metadataJson: { reason: 'admin retry' },
    });
    this.logger.info({ adminUserId, targetId: videoAssetId, action: 'VIDEO_RETRY_REQUESTED' }, 'admin video retry requested');
    return video;
  }

  async listExecutions(query: AdminExecutionListQuery): Promise<AdminPage<AdminExecutionSummary>> {
    const result = await this.admin.listExecutions(query);
    return { items: result.items.map(mapExecution), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async getExecution(executionId: string) {
    const execution = await this.admin.findExecution(executionId);
    if (!execution) {
      throw adminTargetNotFound('Execution not found');
    }
    return { execution: mapExecution(execution) };
  }

  async listJudgeSubmissions(query: AdminJudgeSubmissionListQuery): Promise<AdminPage<AdminJudgeSubmissionSummary>> {
    const result = await this.admin.listJudgeSubmissions(query);
    return { items: result.items.map(mapJudge), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async getJudgeSubmission(submissionId: string) {
    const submission = await this.admin.findJudgeSubmission(submissionId);
    if (!submission) {
      throw adminTargetNotFound('Judge submission not found');
    }
    return { submission: mapJudge(submission) };
  }

  async listProjectSubmissions(query: AdminProjectSubmissionListQuery): Promise<AdminPage<AdminProjectSubmissionSummary>> {
    const result = await this.admin.listProjectSubmissions(query);
    return { items: result.items.map(mapProject), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }

  async getProjectSubmission(submissionId: string) {
    const submission = await this.admin.findProjectSubmission(submissionId);
    if (!submission) {
      throw adminTargetNotFound('Project submission not found');
    }
    return { submission: mapProject(submission) };
  }

  async listAuditLogs(query: AdminAuditLogListQuery): Promise<AdminPage<AdminAuditLogSummary>> {
    const result = await this.admin.listAuditLogs(query);
    return { items: result.items.map(mapAudit), pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }) };
  }
}
