import {
  CourseStatus,
  Prisma,
  RoleName,
  type CourseDifficulty,
  type LessonType,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const courseInclude = {
  category: true,
  ownerInstructor: true,
  tags: {
    include: {
      tag: true,
    },
    orderBy: {
      tag: {
        name: 'asc',
      },
    },
  },
  modules: {
    include: {
      lessons: {
        orderBy: {
          position: 'asc',
        },
      },
    },
    orderBy: {
      position: 'asc',
    },
  },
} satisfies Prisma.CourseInclude;

export type CourseWithStructure = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

export class CourseRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async userHasRole(userId: string, role: RoleName) {
    const count = await this.prisma.userRole.count({
      where: {
        userId,
        role: { name: role },
      },
    });

    return count > 0;
  }

  async categoryExists(categoryId: string) {
    const count = await this.prisma.courseCategory.count({ where: { id: categoryId } });
    return count > 0;
  }

  async listCategories() {
    return this.prisma.courseCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async listTags() {
    return this.prisma.courseTag.findMany({ orderBy: { name: 'asc' } });
  }

  async upsertTags(tags: readonly { readonly name: string; readonly slug: string }[]) {
    const records = [];

    for (const tag of tags) {
      records.push(
        await this.prisma.courseTag.upsert({
          where: { slug: tag.slug },
          update: { name: tag.name },
          create: { name: tag.name, slug: tag.slug },
        }),
      );
    }

    return records;
  }

  async createCourse(input: {
    readonly title: string;
    readonly slug: string;
    readonly shortDescription: string | null;
    readonly description: string | null;
    readonly difficulty: CourseDifficulty;
    readonly categoryId: string;
    readonly thumbnailObjectKey: string | null;
    readonly ownerInstructorId: string;
    readonly tagIds: readonly string[];
  }) {
    return this.prisma.course.create({
      data: {
        title: input.title,
        slug: input.slug,
        shortDescription: input.shortDescription,
        description: input.description,
        difficulty: input.difficulty,
        categoryId: input.categoryId,
        thumbnailObjectKey: input.thumbnailObjectKey,
        ownerInstructorId: input.ownerInstructorId,
        tags: {
          create: input.tagIds.map((tagId) => ({
            tag: { connect: { id: tagId } },
          })),
        },
      },
      include: courseInclude,
    });
  }

  async findById(courseId: string) {
    return this.prisma.course.findUnique({
      where: { id: courseId },
      include: courseInclude,
    });
  }

  async findPublishedBySlug(slug: string) {
    return this.prisma.course.findFirst({
      where: { slug, status: CourseStatus.PUBLISHED },
      include: courseInclude,
    });
  }

  async listPublished(input: {
    readonly skip: number;
    readonly take: number;
    readonly category?: string;
    readonly difficulty?: CourseDifficulty;
    readonly tag?: string;
  }) {
    const where: Prisma.CourseWhereInput = {
      status: CourseStatus.PUBLISHED,
      ...(input.category ? { category: { slug: input.category } } : {}),
      ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      ...(input.tag ? { tags: { some: { tag: { slug: input.tag } } } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        include: courseInclude,
        orderBy: { publishedAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { items, total };
  }

  async listByOwner(ownerInstructorId: string, input: { readonly skip: number; readonly take: number }) {
    const where = { ownerInstructorId };

    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        include: courseInclude,
        orderBy: { updatedAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { items, total };
  }

  async updateCourse(
    courseId: string,
    data: {
      readonly title?: string;
      readonly slug?: string;
      readonly shortDescription?: string | null;
      readonly description?: string | null;
      readonly difficulty?: CourseDifficulty;
      readonly categoryId?: string;
      readonly thumbnailObjectKey?: string | null;
    },
  ) {
    return this.prisma.course.update({
      where: { id: courseId },
      data,
      include: courseInclude,
    });
  }

  async replaceCourseTags(courseId: string, tagIds: readonly string[]) {
    await this.prisma.courseTagAssignment.deleteMany({ where: { courseId } });

    if (tagIds.length === 0) {
      return;
    }

    await this.prisma.courseTagAssignment.createMany({
      data: tagIds.map((tagId) => ({ courseId, tagId })),
      skipDuplicates: true,
    });
  }

  async publish(courseId: string) {
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: courseInclude,
    });
  }

  async archive(courseId: string) {
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        status: CourseStatus.ARCHIVED,
        archivedAt: new Date(),
      },
      include: courseInclude,
    });
  }

  async createModule(courseId: string, input: { readonly title: string; readonly description?: string }) {
    const maxPosition = await this.prisma.courseModule.aggregate({
      where: { courseId },
      _max: { position: true },
    });

    return this.prisma.courseModule.create({
      data: {
        courseId,
        title: input.title,
        description: input.description ?? null,
        position: (maxPosition._max.position ?? 0) + 1,
      },
    });
  }

  async findModuleById(moduleId: string) {
    return this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      include: { course: true, lessons: { orderBy: { position: 'asc' } } },
    });
  }

  async updateModule(moduleId: string, data: { readonly title?: string; readonly description?: string | null }) {
    return this.prisma.courseModule.update({ where: { id: moduleId }, data });
  }

  async deleteModule(moduleId: string) {
    await this.prisma.courseModule.delete({ where: { id: moduleId } });
  }

  async listModules(courseId: string) {
    return this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
    });
  }

  async setModulePosition(moduleId: string, position: number) {
    await this.prisma.courseModule.update({ where: { id: moduleId }, data: { position } });
  }

  async createLesson(moduleId: string, input: {
    readonly title: string;
    readonly description?: string;
    readonly lessonType: LessonType;
  }) {
    const maxPosition = await this.prisma.lesson.aggregate({
      where: { moduleId },
      _max: { position: true },
    });

    return this.prisma.lesson.create({
      data: {
        moduleId,
        title: input.title,
        description: input.description ?? null,
        lessonType: input.lessonType,
        position: (maxPosition._max.position ?? 0) + 1,
      },
    });
  }

  async findLessonById(lessonId: string) {
    return this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
  }

  async updateLesson(lessonId: string, data: {
    readonly title?: string;
    readonly description?: string | null;
    readonly lessonType?: LessonType;
  }) {
    return this.prisma.lesson.update({ where: { id: lessonId }, data });
  }

  async deleteLesson(lessonId: string) {
    await this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  async listLessons(moduleId: string) {
    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { position: 'asc' },
    });
  }

  async setLessonPosition(lessonId: string, position: number) {
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { position } });
  }
}
