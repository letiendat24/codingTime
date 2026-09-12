import { CourseStatus, LearningActivityType, Prisma, RoleName, type PrismaClient } from '@prisma/client';
import { CourseRepository } from '../courses/course.repository';
import { courseNotFound } from '../courses/course.errors';
import { LearningRepository } from '../learning/learning.repository';
import { enrollmentAlreadyExists, enrollmentNotAllowed } from './enrollment.errors';
import { EnrollmentRepository } from './enrollment.repository';
import type { MyCoursesQuery } from './enrollment.schemas';
import type { EnrollmentCourseSummary } from './enrollment.types';
import { paginationMeta } from '../../shared/pagination';

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function mapEnrollment(item: Awaited<ReturnType<EnrollmentRepository['create']>>): EnrollmentCourseSummary {
  return {
    enrollmentId: item.id,
    status: item.status,
    enrolledAt: item.enrolledAt.toISOString(),
    course: {
      id: item.course.id,
      title: item.course.title,
      slug: item.course.slug,
      status: item.course.status,
    },
  };
}

export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly enrollments: EnrollmentRepository,
    private readonly courses: CourseRepository,
    private readonly learning: LearningRepository,
  ) {}

  async enroll(studentId: string, courseId: string): Promise<EnrollmentCourseSummary> {
    const isStudent = await this.courses.userHasRole(studentId, RoleName.STUDENT);

    if (!isStudent) {
      throw enrollmentNotAllowed('Only students can enroll in courses');
    }

    const course = await this.courses.findById(courseId);

    if (!course) {
      throw courseNotFound();
    }

    if (course.status === CourseStatus.DRAFT) {
      throw enrollmentNotAllowed('Students cannot enroll in draft courses');
    }

    if (course.status === CourseStatus.ARCHIVED) {
      throw enrollmentNotAllowed('Archived courses do not accept new enrollments');
    }

    try {
      const enrolled = await this.prisma.$transaction(async (transaction) => {
        const enrollmentRepository = new EnrollmentRepository(transaction);
        const learningRepository = new LearningRepository(transaction);
        const created = await enrollmentRepository.create(studentId, courseId);
        const counts = await learningRepository.getCourseCounts(created.id, courseId);

        await learningRepository.upsertCourseProgress({
          enrollmentId: created.id,
          totalLessons: counts.totalLessons,
          completedLessons: counts.completedLessons,
          progressPercent: counts.totalLessons > 0 ? (counts.completedLessons / counts.totalLessons) * 100 : 0,
        });
        await learningRepository.createActivity({
          userId: studentId,
          type: LearningActivityType.COURSE_ENROLLED,
          courseId,
          enrollmentId: created.id,
          createdAt: new Date(),
        });

        return created;
      });

      return mapEnrollment(enrolled);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw enrollmentAlreadyExists();
      }

      throw error;
    }
  }

  async listMyCourses(studentId: string, query: MyCoursesQuery) {
    const result = await this.learning.listEnrollmentProgress(studentId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      items: result.items.map((item) => ({
        enrollmentId: item.id,
        status: item.status,
        enrolledAt: item.enrolledAt.toISOString(),
        progressPercent: item.courseProgress ? Number(item.courseProgress.progressPercent) : 0,
        completedLessons: item.courseProgress?.completedLessons ?? 0,
        totalLessons: item.courseProgress?.totalLessons ?? 0,
        lastAccessedAt: item.courseProgress?.lastAccessedAt?.toISOString() ?? null,
        course: {
          id: item.course.id,
          title: item.course.title,
          slug: item.course.slug,
          status: item.course.status,
        },
      })),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }
}
