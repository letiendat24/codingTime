import { CourseStatus, LessonType, Prisma, RoleName, ScoringMode, type PrismaClient } from '@prisma/client';
import type {
  CourseListQuery,
  CreateCourseInput,
  CreateLessonInput,
  CreateModuleInput,
  InstructorCourseListQuery,
  UpdateCourseInput,
  UpdateLessonInput,
  UpdateModuleInput,
  UpsertLessonCodingConfigInput,
} from './course.schemas';
import {
  categoryNotFound,
  courseAlreadyArchived,
  courseNotEditable,
  courseNotFound,
  courseNotOwned,
  courseNotPublished,
  courseNotReadyForPublish,
  duplicateCourseSlug,
  invalidOrdering,
  lessonNotFound,
  moduleNotFound,
} from './course.errors';
import { CourseRepository, type CourseWithStructure } from './course.repository';
import type { InstructorCourseDetail, PublicCourseDetail, PublicCourseSummary } from './course.types';
import { paginationMeta } from '../../shared/pagination';
import { QuizService } from '../quiz/quiz.service';

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeTagName(value: string) {
  return value.trim().toLowerCase();
}

function assertUnique(values: readonly string[]) {
  return new Set(values).size === values.length;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function mapTags(course: CourseWithStructure) {
  return course.tags.map((assignment) => ({
    id: assignment.tag.id,
    name: assignment.tag.name,
    slug: assignment.tag.slug,
  }));
}

function mapModules(course: CourseWithStructure) {
  return course.modules.map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    position: module.position,
    lessons: module.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      position: lesson.position,
      lessonType: lesson.lessonType,
    })),
  }));
}

function mapPublicSummary(course: CourseWithStructure): PublicCourseSummary {
  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    shortDescription: course.shortDescription,
    difficulty: course.difficulty,
    category: {
      id: course.category.id,
      name: course.category.name,
      slug: course.category.slug,
    },
    tags: mapTags(course),
    instructor: {
      id: course.ownerInstructor.id,
      displayName: course.ownerInstructor.displayName,
    },
  };
}

function mapPublicDetail(course: CourseWithStructure): PublicCourseDetail {
  return {
    ...mapPublicSummary(course),
    description: course.description,
    modules: mapModules(course),
  };
}

function mapInstructorDetail(course: CourseWithStructure): InstructorCourseDetail {
  return {
    ...mapPublicDetail(course),
    status: course.status,
    thumbnailObjectKey: course.thumbnailObjectKey,
    publishedAt: course.publishedAt?.toISOString() ?? null,
    archivedAt: course.archivedAt?.toISOString() ?? null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

function requireOwnedCourse<T extends { readonly ownerInstructorId: string } | null>(
  course: T,
  instructorId: string,
): NonNullable<T> {
  if (!course) {
    throw courseNotFound();
  }

  if (course.ownerInstructorId !== instructorId) {
    throw courseNotOwned();
  }

  return course;
}

function assertDraft(course: { readonly status: CourseStatus }) {
  if (course.status !== CourseStatus.DRAFT) {
    throw courseNotEditable();
  }
}

function assertValidPositions(items: readonly { readonly position: number }[]) {
  const positions = items.map((item) => item.position).sort((left, right) => left - right);

  return positions.every((position, index) => position === index + 1);
}

export class CourseService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly courses: CourseRepository,
  ) {}

  async listCategories() {
    return this.courses.listCategories();
  }

  async listTags() {
    return this.courses.listTags();
  }

  async createCourse(instructorId: string, input: CreateCourseInput): Promise<InstructorCourseDetail> {
    const isInstructor = await this.courses.userHasRole(instructorId, RoleName.INSTRUCTOR);

    if (!isInstructor) {
      throw courseNotOwned();
    }

    if (!(await this.courses.categoryExists(input.categoryId))) {
      throw categoryNotFound();
    }

    const slug = slugify(input.slug ?? input.title);
    const normalizedTags = [...new Set(input.tags.map(normalizeTagName))]
      .map((name) => ({ name, slug: slugify(name) }))
      .filter((tag) => tag.slug.length > 0);

    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const repository = new CourseRepository(transaction);
        const tags = await repository.upsertTags(normalizedTags);

        return repository.createCourse({
          title: input.title,
          slug,
          shortDescription: input.shortDescription ?? null,
          description: input.description ?? null,
          difficulty: input.difficulty,
          categoryId: input.categoryId,
          thumbnailObjectKey: input.thumbnailObjectKey ?? null,
          ownerInstructorId: instructorId,
          tagIds: tags.map((tag) => tag.id),
        });
      });

      return mapInstructorDetail(created);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw duplicateCourseSlug();
      }

      throw error;
    }
  }

  async listInstructorCourses(instructorId: string, query: InstructorCourseListQuery) {
    const result = await this.courses.listByOwner(instructorId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      items: result.items.map(mapInstructorDetail),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async getInstructorCourse(instructorId: string, courseId: string) {
    const course = requireOwnedCourse(await this.courses.findById(courseId), instructorId);
    return mapInstructorDetail(course);
  }

  async updateCourse(instructorId: string, courseId: string, input: UpdateCourseInput) {
    const course = requireOwnedCourse(await this.courses.findById(courseId), instructorId);
    this.assertEditableDraft(course);

    if (input.categoryId && !(await this.courses.categoryExists(input.categoryId))) {
      throw categoryNotFound();
    }

    const slug = input.slug ? slugify(input.slug) : undefined;
    const normalizedTags = input.tags
      ? [...new Set(input.tags.map(normalizeTagName))]
          .map((name) => ({ name, slug: slugify(name) }))
          .filter((tag) => tag.slug.length > 0)
      : undefined;

    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const repository = new CourseRepository(transaction);

        if (normalizedTags) {
          const tags = await repository.upsertTags(normalizedTags);
          await repository.replaceCourseTags(courseId, tags.map((tag) => tag.id));
        }

        return repository.updateCourse(courseId, {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(input.shortDescription !== undefined ? { shortDescription: input.shortDescription } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.thumbnailObjectKey !== undefined ? { thumbnailObjectKey: input.thumbnailObjectKey } : {}),
        });
      });

      return mapInstructorDetail(updated);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw duplicateCourseSlug();
      }

      throw error;
    }
  }

  async publishCourse(instructorId: string, courseId: string) {
    const course = requireOwnedCourse(await this.courses.findById(courseId), instructorId);

    if (course.status === CourseStatus.ARCHIVED) {
      throw courseAlreadyArchived();
    }

    if (course.status === CourseStatus.PUBLISHED) {
      return mapInstructorDetail(course);
    }

    const validationErrors = this.validatePublishReadiness(course);

    if (validationErrors.length > 0) {
      throw courseNotReadyForPublish(validationErrors);
    }

    return mapInstructorDetail(await this.courses.publish(courseId));
  }

  async unpublishCourse(instructorId: string, courseId: string) {
    const course = requireOwnedCourse(await this.courses.findById(courseId), instructorId);

    if (course.status === CourseStatus.ARCHIVED) {
      throw courseAlreadyArchived();
    }

    if (course.status === CourseStatus.DRAFT) {
      return mapInstructorDetail(course);
    }

    return mapInstructorDetail(await this.courses.unpublish(courseId));
  }

  async archiveCourse(instructorId: string, courseId: string) {
    const course = requireOwnedCourse(await this.courses.findById(courseId), instructorId);

    if (course.status === CourseStatus.ARCHIVED) {
      throw courseAlreadyArchived();
    }

    if (course.status !== CourseStatus.PUBLISHED) {
      throw courseNotPublished();
    }

    return mapInstructorDetail(await this.courses.archive(courseId));
  }

  async listPublishedCourses(query: CourseListQuery) {
    const result = await this.courses.listPublished({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ...(query.category ? { category: slugify(query.category) } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.tag ? { tag: slugify(query.tag) } : {}),
    });

    return {
      items: result.items.map(mapPublicSummary),
      pagination: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    };
  }

  async getPublishedCourse(slug: string) {
    const course = await this.courses.findPublishedBySlug(slug);

    if (!course) {
      throw courseNotFound();
    }

    return mapPublicDetail(course);
  }

  async createModule(instructorId: string, courseId: string, input: CreateModuleInput) {
    const course = requireOwnedCourse(await this.courses.findById(courseId), instructorId);
    this.assertEditableDraft(course);

    return this.courses.createModule(courseId, {
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  }

  async updateModule(instructorId: string, moduleId: string, input: UpdateModuleInput) {
    const module = await this.courses.findModuleById(moduleId);

    if (!module) {
      throw moduleNotFound();
    }

    requireOwnedCourse(module.course, instructorId);
    this.assertEditableDraft(module.course);

    return this.courses.updateModule(moduleId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  }

  async deleteModule(instructorId: string, moduleId: string) {
    const module = await this.courses.findModuleById(moduleId);

    if (!module) {
      throw moduleNotFound();
    }

    requireOwnedCourse(module.course, instructorId);
    this.assertEditableDraft(module.course);

    await this.prisma.$transaction(async (transaction) => {
      const repository = new CourseRepository(transaction);
      await repository.deleteModule(moduleId);
      await this.normalizeModulePositions(repository, module.courseId);
    });
  }

  async reorderModules(instructorId: string, courseId: string, moduleIds: readonly string[]) {
    if (!assertUnique(moduleIds)) {
      throw invalidOrdering();
    }

    const course = requireOwnedCourse(await this.courses.findById(courseId), instructorId);
    this.assertEditableDraft(course);

    const existingModules = await this.courses.listModules(courseId);

    if (
      existingModules.length !== moduleIds.length ||
      existingModules.some((module) => !moduleIds.includes(module.id))
    ) {
      throw invalidOrdering();
    }

    await this.prisma.$transaction(async (transaction) => {
      const repository = new CourseRepository(transaction);

      for (const [index, moduleId] of moduleIds.entries()) {
        await repository.setModulePosition(moduleId, -(index + 1));
      }

      for (const [index, moduleId] of moduleIds.entries()) {
        await repository.setModulePosition(moduleId, index + 1);
      }
    });
  }

  async createLesson(instructorId: string, moduleId: string, input: CreateLessonInput) {
    const module = await this.courses.findModuleById(moduleId);

    if (!module) {
      throw moduleNotFound();
    }

    requireOwnedCourse(module.course, instructorId);
    this.assertEditableDraft(module.course);

    return this.courses.createLesson(moduleId, {
      title: input.title,
      lessonType: input.lessonType,
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
  }

  async updateLesson(instructorId: string, lessonId: string, input: UpdateLessonInput) {
    const lesson = await this.courses.findLessonById(lessonId);

    if (!lesson) {
      throw lessonNotFound();
    }

    requireOwnedCourse(lesson.module.course, instructorId);
    this.assertEditableDraft(lesson.module.course);

    return this.courses.updateLesson(lessonId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.lessonType !== undefined ? { lessonType: input.lessonType } : {}),
    });
  }

  async deleteLesson(instructorId: string, lessonId: string) {
    const lesson = await this.courses.findLessonById(lessonId);

    if (!lesson) {
      throw lessonNotFound();
    }

    requireOwnedCourse(lesson.module.course, instructorId);
    this.assertEditableDraft(lesson.module.course);

    await this.prisma.$transaction(async (transaction) => {
      const repository = new CourseRepository(transaction);
      await repository.deleteLesson(lessonId);
      await this.normalizeLessonPositions(repository, lesson.moduleId);
    });
  }

  async getLessonCodingConfig(instructorId: string, lessonId: string) {
    const lesson = await this.courses.findLessonWithCodingConfig(instructorId, lessonId);

    if (!lesson) {
      throw lessonNotFound();
    }

    requireOwnedCourse(lesson.module.course, instructorId);

    const checkpoint = lesson.videoCheckpoints[0];
    const codingConfig = checkpoint?.codingConfig;

    let starterFiles: { path: string; content: string }[] = [];
    if (codingConfig?.starterFilesJson && typeof codingConfig.starterFilesJson === 'object') {
      const json = codingConfig.starterFilesJson as { files?: { path: string; content: string }[] };
      if (Array.isArray(json.files)) {
        starterFiles = json.files;
      }
    }
    if (starterFiles.length === 0) {
      starterFiles = [{ path: codingConfig?.entryFile ?? 'index.js', content: '' }];
    }

    return {
      lessonId: lesson.id,
      checkpointId: checkpoint?.id ?? null,
      config: codingConfig
        ? {
            id: codingConfig.id,
            language: codingConfig.language,
            entryFile: codingConfig.entryFile,
            starterFiles,
            timeLimitMs: codingConfig.timeLimitMs,
            memoryLimitMb: codingConfig.memoryLimitMb,
            passScore: Number(codingConfig.passScore),
            scoringMode: codingConfig.scoringMode,
            testCases: codingConfig.testCases.map((t) => ({
              id: t.id,
              name: t.name,
              visibility: t.visibility,
              input: t.input,
              expectedOutput: t.expectedOutput,
              weight: Number(t.weight),
              position: t.position,
            })),
          }
        : null,
    };
  }

  async upsertLessonCodingConfig(instructorId: string, lessonId: string, input: UpsertLessonCodingConfigInput) {
    const lesson = await this.courses.findLessonWithCodingConfig(instructorId, lessonId);

    if (!lesson) {
      throw lessonNotFound();
    }

    requireOwnedCourse(lesson.module.course, instructorId);
    this.assertEditableDraft(lesson.module.course);

    const entryFile = input.entryFile ?? 'index.js';
    const starterFiles = input.starterFiles ?? [{ path: entryFile, content: '' }];
    const timeLimitMs = input.timeLimitMs ?? 5_000;
    const memoryLimitMb = input.memoryLimitMb ?? 128;
    const passScore = input.passScore ?? 70;
    const scoringMode = input.scoringMode ?? ScoringMode.WEIGHTED;

    const config = await this.courses.upsertLessonCodingConfig({
      lessonId,
      title: lesson.title,
      language: input.language ?? 'javascript',
      entryFile,
      starterFiles,
      timeLimitMs,
      memoryLimitMb,
      passScore,
      scoringMode,
      testCases: input.testCases,
    });

    return {
      lessonId,
      config: config
        ? {
            id: config.id,
            language: config.language,
            entryFile: config.entryFile,
            starterFiles,
            timeLimitMs: config.timeLimitMs,
            memoryLimitMb: config.memoryLimitMb,
            passScore: Number(config.passScore),
            scoringMode: config.scoringMode,
            testCases: config.testCases.map((t) => ({
              id: t.id,
              name: t.name,
              visibility: t.visibility,
              input: t.input,
              expectedOutput: t.expectedOutput,
              weight: Number(t.weight),
              position: t.position,
            })),
          }
        : null,
    };
  }

  async reorderLessons(instructorId: string, moduleId: string, lessonIds: readonly string[]) {
    if (!assertUnique(lessonIds)) {
      throw invalidOrdering();
    }

    const module = await this.courses.findModuleById(moduleId);

    if (!module) {
      throw moduleNotFound();
    }

    requireOwnedCourse(module.course, instructorId);
    this.assertEditableDraft(module.course);

    const existingLessons = await this.courses.listLessons(moduleId);

    if (
      existingLessons.length !== lessonIds.length ||
      existingLessons.some((lesson) => !lessonIds.includes(lesson.id))
    ) {
      throw invalidOrdering();
    }

    await this.prisma.$transaction(async (transaction) => {
      const repository = new CourseRepository(transaction);

      for (const [index, lessonId] of lessonIds.entries()) {
        await repository.setLessonPosition(lessonId, -(index + 1));
      }

      for (const [index, lessonId] of lessonIds.entries()) {
        await repository.setLessonPosition(lessonId, index + 1);
      }
    });
  }

  private assertEditableDraft(course: { readonly status: CourseStatus }) {
    assertDraft(course);
  }

  private validatePublishReadiness(course: CourseWithStructure) {
    const errors: string[] = [];

    if (!course.title.trim()) {
      errors.push('Course must have a title');
    }

    if (!course.description?.trim() && !course.shortDescription?.trim()) {
      errors.push('Course must have a description or short description');
    }

    if (!course.categoryId) {
      errors.push('Course must have a category');
    }

    if (course.modules.length === 0) {
      errors.push('Course must contain at least one module');
    }

    const lessonCount = course.modules.reduce((count, module) => count + module.lessons.length, 0);

    if (lessonCount === 0) {
      errors.push('Course must contain at least one lesson');
    }

    if (!assertValidPositions(course.modules)) {
      errors.push('Course modules must have valid ordering');
    }

    for (const module of course.modules) {
      if (!assertValidPositions(module.lessons)) {
        errors.push(`Lessons in module "${module.title}" must have valid ordering`);
      }

      for (const lesson of module.lessons) {
        if (lesson.lessonType === LessonType.QUIZ) {
          const quizErrors = QuizService.validateQuizForPublish(lesson.quiz);
          errors.push(...quizErrors.map((error) => `Quiz lesson "${lesson.title}": ${error}`));
        }
      }
    }

    return errors;
  }

  private async normalizeModulePositions(repository: CourseRepository, courseId: string) {
    const modules = await repository.listModules(courseId);

    for (const [index, module] of modules.entries()) {
      await repository.setModulePosition(module.id, index + 1);
    }
  }

  private async normalizeLessonPositions(repository: CourseRepository, moduleId: string) {
    const lessons = await repository.listLessons(moduleId);

    for (const [index, lesson] of lessons.entries()) {
      await repository.setLessonPosition(lesson.id, index + 1);
    }
  }
}
