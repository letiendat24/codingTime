import { EnrollmentStatus, Prisma, type PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export class EnrollmentRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async create(studentId: string, courseId: string) {
    return this.prisma.enrollment.create({
      data: {
        studentId,
        courseId,
        status: EnrollmentStatus.ACTIVE,
      },
      include: {
        course: true,
      },
    });
  }

  async listByStudent(studentId: string, input: { readonly skip: number; readonly take: number }) {
    const where = { studentId };

    const [items, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        include: {
          course: true,
        },
        orderBy: { enrolledAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return { items, total };
  }
}
