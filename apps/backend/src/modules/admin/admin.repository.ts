import {
  CourseStatus,
  EnrollmentStatus,
  ExecutionStatus,
  JudgeSubmissionStatus,
  ProjectSubmissionStatus,
  Prisma,
  RoleName,
  UserStatus,
  VideoAssetStatus,
  type PrismaClient,
} from '@prisma/client';
import type {
  AdminAuditLogListQuery,
  AdminCourseListQuery,
  AdminEnrollmentListQuery,
  AdminExecutionListQuery,
  AdminInstructorListQuery,
  AdminJudgeSubmissionListQuery,
  AdminProjectSubmissionListQuery,
  AdminUserListQuery,
  AdminVideoListQuery,
} from './admin.schemas';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const userInclude = {
  roles: { include: { role: true }, orderBy: { role: { name: 'asc' } } },
} satisfies Prisma.UserInclude;

const courseListInclude = {
  ownerInstructor: true,
  modules: { include: { lessons: true } },
  _count: { select: { enrollments: true, modules: true } },
} satisfies Prisma.CourseInclude;

const courseDetailInclude = {
  ownerInstructor: { include: userInclude },
  category: true,
  tags: { include: { tag: true }, orderBy: { tag: { name: 'asc' } } },
  modules: { include: { lessons: { include: { videoAsset: true }, orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } },
  enrollments: { take: 10, orderBy: { enrolledAt: 'desc' }, include: { student: true, courseProgress: true } },
  _count: { select: { enrollments: true, modules: true } },
} satisfies Prisma.CourseInclude;

const videoInclude = {
  jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
  failures: { orderBy: { createdAt: 'desc' }, take: 1 },
  lesson: { include: { module: { include: { course: { include: { ownerInstructor: true } } } } } },
} satisfies Prisma.VideoAssetInclude;

const executionInclude = {
  user: true,
  result: true,
} satisfies Prisma.ExecutionRequestInclude;

const judgeInclude = {
  user: true,
  result: true,
  checkpoint: { include: { lesson: { include: { module: { include: { course: true } } } } } },
  practiceProblem: true,
} satisfies Prisma.JudgeSubmissionInclude;

const projectInclude = {
  user: true,
  grade: true,
  checkpoint: { include: { lesson: { include: { module: { include: { course: true } } } } } },
} satisfies Prisma.ProjectSubmissionInclude;

export type AdminUserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }> & {
  readonly _count?: { readonly sessions?: number; readonly enrollments?: number; readonly ownedCourses?: number };
};
export type AdminCourseRecord = Prisma.CourseGetPayload<{ include: typeof courseListInclude }>;
export type AdminCourseDetailRecord = Prisma.CourseGetPayload<{ include: typeof courseDetailInclude }>;
export type AdminVideoRecord = Prisma.VideoAssetGetPayload<{ include: typeof videoInclude }>;
export type AdminExecutionRecord = Prisma.ExecutionRequestGetPayload<{ include: typeof executionInclude }>;
export type AdminJudgeRecord = Prisma.JudgeSubmissionGetPayload<{ include: typeof judgeInclude }>;
export type AdminProjectRecord = Prisma.ProjectSubmissionGetPayload<{ include: typeof projectInclude }>;
export type AdminAuditRecord = Prisma.AdminAuditLogGetPayload<{ include: { adminUser: true } }>;

function skip(page: number, limit: number) {
  return (page - 1) * limit;
}

function searchUser(search: string | undefined): Prisma.UserWhereInput {
  if (!search) {
    return {};
  }

  return {
    OR: [
      { email: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
    ],
  };
}

function courseSearch(search: string | undefined): Prisma.CourseWhereInput {
  if (!search) {
    return {};
  }

  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
    ],
  };
}

export class AdminRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async countUsers() {
    const [total, active, suspended, disabled, roleCounts] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({ where: { status: UserStatus.DISABLED } }),
      this.prisma.userRole.groupBy({ by: ['roleId'], _count: { roleId: true } }),
    ]);
    const roles = await this.prisma.role.findMany();
    const countsByRole = new Map(roleCounts.map((item) => [item.roleId, item._count.roleId]));

    return {
      total,
      active,
      suspended,
      disabled,
      students: countsByRole.get(roles.find((role) => role.name === RoleName.STUDENT)?.id ?? '') ?? 0,
      instructors: countsByRole.get(roles.find((role) => role.name === RoleName.INSTRUCTOR)?.id ?? '') ?? 0,
      admins: countsByRole.get(roles.find((role) => role.name === RoleName.ADMIN)?.id ?? '') ?? 0,
    };
  }

  async countCourses() {
    const [total, draft, published, archived, enrollments, activeEnrollments, completedEnrollments] = await Promise.all([
      this.prisma.course.count(),
      this.prisma.course.count({ where: { status: CourseStatus.DRAFT } }),
      this.prisma.course.count({ where: { status: CourseStatus.PUBLISHED } }),
      this.prisma.course.count({ where: { status: CourseStatus.ARCHIVED } }),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.ACTIVE } }),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.COMPLETED } }),
    ]);

    return { total, draft, published, archived, enrollments, activeEnrollments, completedEnrollments };
  }

  async countLearning() {
    const [completedLessons, completedCourses, videoCompletions, codingSubmissions, successfulCodingSubmissions, projectSubmissions, passedProjectSubmissions] =
      await Promise.all([
        this.prisma.lessonProgress.count({ where: { status: 'COMPLETED' } }),
        this.prisma.courseProgress.count({ where: { completedAt: { not: null } } }),
        this.prisma.videoProgress.count({ where: { completedAt: { not: null } } }),
        this.prisma.judgeSubmission.count(),
        this.prisma.judgeSubmission.count({ where: { status: JudgeSubmissionStatus.ACCEPTED } }),
        this.prisma.projectSubmission.count(),
        this.prisma.projectSubmission.count({ where: { status: ProjectSubmissionStatus.PASSED } }),
      ]);

    return {
      completedLessons,
      completedCourses,
      videoCompletions,
      codingSubmissions,
      successfulCodingSubmissions,
      projectSubmissions,
      passedProjectSubmissions,
    };
  }

  async countOperations(since: Date) {
    const [
      videosQueued,
      videosProcessing,
      videosReady,
      videosFailed,
      executionQueued,
      executionRunning,
      executionSucceeded,
      executionFailed,
      executionTimedOut,
      judgeQueued,
      judgeRunning,
      judgeAccepted,
      judgeRejected,
      judgeFailed,
      projectQueued,
      projectGrading,
      projectPassed,
      projectFailed,
      projectAwaitingReview,
      videoFailuresRecent,
      executionInfraFailuresRecent,
      judgeInfraFailuresRecent,
      projectInfraFailuresRecent,
    ] = await Promise.all([
      this.prisma.videoAsset.count({ where: { status: VideoAssetStatus.QUEUED } }),
      this.prisma.videoAsset.count({ where: { status: VideoAssetStatus.PROCESSING } }),
      this.prisma.videoAsset.count({ where: { status: VideoAssetStatus.READY } }),
      this.prisma.videoAsset.count({ where: { status: VideoAssetStatus.FAILED } }),
      this.prisma.executionRequest.count({ where: { status: ExecutionStatus.QUEUED } }),
      this.prisma.executionRequest.count({ where: { status: ExecutionStatus.RUNNING } }),
      this.prisma.executionRequest.count({ where: { status: ExecutionStatus.SUCCEEDED } }),
      this.prisma.executionRequest.count({ where: { status: ExecutionStatus.FAILED } }),
      this.prisma.executionRequest.count({ where: { status: ExecutionStatus.TIMED_OUT } }),
      this.prisma.judgeSubmission.count({ where: { status: JudgeSubmissionStatus.QUEUED } }),
      this.prisma.judgeSubmission.count({ where: { status: JudgeSubmissionStatus.RUNNING } }),
      this.prisma.judgeSubmission.count({ where: { status: JudgeSubmissionStatus.ACCEPTED } }),
      this.prisma.judgeSubmission.count({ where: { status: JudgeSubmissionStatus.REJECTED } }),
      this.prisma.judgeSubmission.count({ where: { status: JudgeSubmissionStatus.FAILED } }),
      this.prisma.projectSubmission.count({ where: { status: ProjectSubmissionStatus.QUEUED } }),
      this.prisma.projectSubmission.count({ where: { status: ProjectSubmissionStatus.GRADING } }),
      this.prisma.projectSubmission.count({ where: { status: ProjectSubmissionStatus.PASSED } }),
      this.prisma.projectSubmission.count({ where: { status: { in: [ProjectSubmissionStatus.FAILED, ProjectSubmissionStatus.ERROR, ProjectSubmissionStatus.TIMED_OUT] } } }),
      this.prisma.projectSubmission.count({ where: { status: ProjectSubmissionStatus.AWAITING_REVIEW } }),
      this.prisma.videoAsset.count({ where: { status: VideoAssetStatus.FAILED, failedAt: { gte: since } } }),
      this.prisma.executionRequest.count({ where: { status: { in: [ExecutionStatus.FAILED, ExecutionStatus.TIMED_OUT] }, createdAt: { gte: since } } }),
      this.prisma.judgeSubmission.count({ where: { status: { in: [JudgeSubmissionStatus.FAILED, JudgeSubmissionStatus.TIMED_OUT] }, createdAt: { gte: since } } }),
      this.prisma.projectSubmission.count({ where: { status: { in: [ProjectSubmissionStatus.ERROR, ProjectSubmissionStatus.TIMED_OUT] }, createdAt: { gte: since } } }),
    ]);

    return {
      videos: { queued: videosQueued, processing: videosProcessing, ready: videosReady, failed: videosFailed },
      codeExecutions: { queued: executionQueued, running: executionRunning, succeeded: executionSucceeded, failed: executionFailed, timedOut: executionTimedOut },
      judgeSubmissions: { queued: judgeQueued, running: judgeRunning, accepted: judgeAccepted, rejected: judgeRejected, failed: judgeFailed },
      projectGrading: { queued: projectQueued, grading: projectGrading, passed: projectPassed, failed: projectFailed, awaitingReview: projectAwaitingReview },
      failures: { videoFailures: videoFailuresRecent, codeExecutionInfraFailures: executionInfraFailuresRecent, judgeInfraFailures: judgeInfraFailuresRecent, projectGradingInfraFailures: projectInfraFailuresRecent },
    };
  }

  async listRecentActivity(limit: number) {
    return this.prisma.learningActivity.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: true, course: true, lesson: true },
    });
  }

  async listUsers(query: AdminUserListQuery) {
    const where: Prisma.UserWhereInput = {
      ...searchUser(query.search),
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { roles: { some: { role: { name: query.role } } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, include: userInclude, orderBy: { createdAt: 'desc' }, skip: skip(query.page, query.limit), take: query.limit }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async findUserDetail(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ...userInclude,
        _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } }, enrollments: true, ownedCourses: true } },
        learningActivities: { take: 10, orderBy: { createdAt: 'desc' }, include: { course: true, lesson: true } },
      },
    });
  }

  async countActiveAdminsExcluding(userId: string) {
    return this.prisma.user.count({
      where: {
        id: { not: userId },
        status: UserStatus.ACTIVE,
        roles: { some: { role: { name: RoleName.ADMIN } } },
      },
    });
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    return this.prisma.user.update({ where: { id: userId }, data: { status }, include: userInclude });
  }

  async revokeActiveSessions(userId: string) {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async replaceUserRoles(userId: string, roleIds: readonly string[]) {
    await this.prisma.userRole.deleteMany({ where: { userId } });
    await this.prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId })),
      skipDuplicates: true,
    });
  }

  async roleIdsByName(roles: readonly RoleName[]) {
    return this.prisma.role.findMany({ where: { name: { in: [...roles] } } });
  }

  async listInstructors(query: AdminInstructorListQuery) {
    const where: Prisma.UserWhereInput = {
      ...searchUser(query.search),
      ...(query.status ? { status: query.status } : {}),
      roles: { some: { role: { name: RoleName.INSTRUCTOR } } },
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          ...userInclude,
          ownedCourses: { include: { _count: { select: { enrollments: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: skip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async listCourses(query: AdminCourseListQuery) {
    const where: Prisma.CourseWhereInput = {
      ...courseSearch(query.search),
      ...(query.status ? { status: query.status } : {}),
      ...(query.instructorId ? { ownerInstructorId: query.instructorId } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({ where, include: courseListInclude, orderBy: { createdAt: 'desc' }, skip: skip(query.page, query.limit), take: query.limit }),
      this.prisma.course.count({ where }),
    ]);

    return { items, total };
  }

  async findCourseDetail(courseId: string) {
    return this.prisma.course.findUnique({ where: { id: courseId }, include: courseDetailInclude });
  }

  async archiveCourse(courseId: string) {
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: CourseStatus.ARCHIVED, archivedAt: new Date() },
      include: courseDetailInclude,
    });
  }

  async listEnrollments(query: AdminEnrollmentListQuery) {
    const where: Prisma.EnrollmentWhereInput = {
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        include: { student: true, course: true, courseProgress: true },
        orderBy: { enrolledAt: 'desc' },
        skip: skip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return { items, total };
  }

  async listVideos(query: AdminVideoListQuery) {
    const where: Prisma.VideoAssetWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.instructorId ? { createdByUserId: query.instructorId } : {}),
      ...(query.courseId ? { lesson: { module: { courseId: query.courseId } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.videoAsset.findMany({ where, include: videoInclude, orderBy: { createdAt: 'desc' }, skip: skip(query.page, query.limit), take: query.limit }),
      this.prisma.videoAsset.count({ where }),
    ]);

    return { items, total };
  }

  async findVideo(videoAssetId: string) {
    return this.prisma.videoAsset.findUnique({ where: { id: videoAssetId }, include: videoInclude });
  }

  async listExecutions(query: AdminExecutionListQuery) {
    const where: Prisma.ExecutionRequestWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.executionRequest.findMany({ where, include: executionInclude, orderBy: { createdAt: 'desc' }, skip: skip(query.page, query.limit), take: query.limit }),
      this.prisma.executionRequest.count({ where }),
    ]);

    return { items, total };
  }

  async findExecution(executionId: string) {
    return this.prisma.executionRequest.findUnique({ where: { id: executionId }, include: executionInclude });
  }

  async listJudgeSubmissions(query: AdminJudgeSubmissionListQuery) {
    const where: Prisma.JudgeSubmissionWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.judgeSubmission.findMany({ where, include: judgeInclude, orderBy: { createdAt: 'desc' }, skip: skip(query.page, query.limit), take: query.limit }),
      this.prisma.judgeSubmission.count({ where }),
    ]);

    return { items, total };
  }

  async findJudgeSubmission(submissionId: string) {
    return this.prisma.judgeSubmission.findUnique({ where: { id: submissionId }, include: judgeInclude });
  }

  async listProjectSubmissions(query: AdminProjectSubmissionListQuery) {
    const where: Prisma.ProjectSubmissionWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.projectSubmission.findMany({ where, include: projectInclude, orderBy: { submittedAt: 'desc' }, skip: skip(query.page, query.limit), take: query.limit }),
      this.prisma.projectSubmission.count({ where }),
    ]);

    return { items, total };
  }

  async findProjectSubmission(submissionId: string) {
    return this.prisma.projectSubmission.findUnique({ where: { id: submissionId }, include: projectInclude });
  }

  async createAuditLog(input: {
    readonly adminUserId: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly metadataJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadataJson: input.metadataJson ?? Prisma.JsonNull,
      },
    });
  }

  async listAuditLogs(query: AdminAuditLogListQuery) {
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.adminUserId ? { adminUserId: query.adminUserId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        include: { adminUser: true },
        orderBy: { createdAt: 'desc' },
        skip: skip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return { items, total };
  }
}
