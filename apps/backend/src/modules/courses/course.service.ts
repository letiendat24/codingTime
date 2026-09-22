import {
  CourseStatus,
  LessonType,
  Prisma,
  RoleName,
  ScoringMode,
  type PrismaClient,
  type VideoCodeAlongConfig,
  type VideoPracticeBehavior,
  type VideoPracticeVerificationMode,
} from '@prisma/client';
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
  type CoursePublishIssue,
} from './course.errors';
import { CourseRepository, type CourseWithStructure } from './course.repository';
import type { InstructorCourseDetail, PublicCourseDetail, PublicCourseSummary } from './course.types';
import { paginationMeta } from '../../shared/pagination';
import { QuizService } from '../quiz/quiz.service';
import { resolveEffectivePracticeConfig } from '@codesync/shared';

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

function isSafeRelativePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const trimmed = filePath.trim();
  if (!trimmed || trimmed.includes('\0')) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return false;
  const parts = trimmed.split(/[/\\]/);
  return !parts.includes('..') && !parts.includes('.');
}

function parseSnapshotFiles(snapshot: { filesJson: unknown }): Array<{ path: string; content: string }> {
  const source = snapshot.filesJson && typeof snapshot.filesJson === 'object'
    ? snapshot.filesJson as { files?: unknown }
    : {};
  return Array.isArray(source.files)
    ? source.files.filter((file): file is { path: string; content: string } =>
        Boolean(file) && typeof file === 'object' && typeof (file as { path?: unknown }).path === 'string')
    : [];
}

function parseVerificationRules(value: unknown) {
  const source = value && typeof value === 'object' ? value as {
    readonly requiredPaths?: unknown;
    readonly rules?: unknown;
  } : {};
  const requiredPaths = Array.isArray(source.requiredPaths)
    ? source.requiredPaths.filter((path): path is string => typeof path === 'string' && path.length > 0)
    : [];
  const rules = Array.isArray(source.rules)
    ? source.rules
        .filter((rule): rule is { readonly type: string; readonly path?: string; readonly value?: string; readonly field?: string } =>
          Boolean(rule)
          && typeof rule === 'object'
          && typeof (rule as { readonly type?: unknown }).type === 'string')
        .map((rule) => ({
          type: rule.type,
          path: typeof rule.path === 'string' ? rule.path : undefined,
          value: typeof rule.value === 'string' ? rule.value : undefined,
          field: typeof rule.field === 'string' ? rule.field : undefined,
        }))
    : [];
  return { requiredPaths, rules };
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

    const { errors: validationErrors, issues: validationIssues } = this.validatePublishReadiness(course);

    if (validationErrors.length > 0) {
      throw courseNotReadyForPublish(validationErrors, validationIssues);
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
    const issues: CoursePublishIssue[] = [];

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
        } else if (lesson.lessonType === LessonType.VIDEO && lesson.videoAsset) {
          const snapshots = lesson.videoAsset.codeSnapshots;
          const codeAlongConfig = (lesson as { codeAlongConfig?: VideoCodeAlongConfig | null }).codeAlongConfig;

          const allSnapshots = snapshots.map((s) => ({
            id: s.id,
            timestampSeconds: s.timestampSeconds,
            files: parseSnapshotFiles(s),
          }));

          for (const checkpoint of lesson.videoAsset.checkpoints) {
            if (checkpoint.practiceEnabled) {
              const hasValidTests = Boolean(checkpoint.codingConfig?.testCases && checkpoint.codingConfig.testCases.length > 0);
              const configMode = checkpoint.practiceConfigMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'AUTO';

              if (configMode === 'MANUAL_OVERRIDE' && checkpoint.practiceSnapshotId && !snapshots.some((s) => s.id === checkpoint.practiceSnapshotId)) {
                const msg = `Video checkpoint "${checkpoint.title}" references a code snapshot outside this lesson/video`;
                errors.push(msg);
                issues.push({
                  type: 'INVALID_REFERENCE_SNAPSHOT',
                  severity: 'ERROR',
                  lessonId: lesson.id,
                  checkpointId: checkpoint.id,
                  checkpointTitle: checkpoint.title,
                  message: 'This practice step references a snapshot that does not belong to this video lesson.',
                  fix: 'Edit the milestone and use the milestone instructor code as the reference, or choose a valid snapshot from this lesson.',
                });
                continue;
              }

              const checkpointOverride = configMode === 'MANUAL_OVERRIDE'
                ? {
                    behavior: (checkpoint.practiceBehavior ?? undefined) as VideoPracticeBehavior | undefined,
                    verificationMode: (checkpoint.practiceVerificationMode ?? undefined) as VideoPracticeVerificationMode | undefined,
                    targetFilePath: checkpoint.practiceTargetFilePath,
                    practiceSnapshotId: checkpoint.practiceSnapshotId,
                    targetStartLine: checkpoint.practiceTargetStartLine,
                    targetEndLine: checkpoint.practiceTargetEndLine,
                    verificationRules: (checkpoint.practiceVerificationRulesJson as Record<string, unknown> | null) ?? undefined,
                  }
                : {
                    targetFilePath: checkpoint.practiceTargetFilePath,
                    targetStartLine: checkpoint.practiceTargetStartLine,
                    targetEndLine: checkpoint.practiceTargetEndLine,
                    verificationRules: (checkpoint.practiceVerificationRulesJson as Record<string, unknown> | null) ?? undefined,
                  };

              const effective = resolveEffectivePracticeConfig({
                lessonDefaults: {
                  defaultPracticeBehavior: codeAlongConfig?.defaultPracticeBehavior,
                  defaultVerificationStrategy: codeAlongConfig?.defaultVerificationStrategy,
                  language: codeAlongConfig?.language ?? 'typescript',
                  entryFile: codeAlongConfig?.entryFile ?? 'src/index.ts',
                },
                checkpointOverride,
                checkpointContext: {
                  timestampSeconds: checkpoint.timestampSeconds,
                  studentTask: checkpoint.description?.trim() ?? '',
                  hasValidTests,
                  judgeSupported: hasValidTests,
                  structuralSupported: true,
                  activeFilePath: checkpoint.practiceTargetFilePath ?? undefined,
                },
                allSnapshots,
              });
              const snapshotObj = effective.practiceSnapshotId
                ? snapshots.find((s) => s.id === effective.practiceSnapshotId)
                : undefined;
              const snapshotFiles = snapshotObj ? parseSnapshotFiles(snapshotObj) : [];

              if (
                effective.targetStartLine &&
                effective.targetEndLine &&
                effective.targetEndLine < effective.targetStartLine
              ) {
                const msg = `Video checkpoint "${checkpoint.title}": Target end line must be greater than or equal to start line`;
                errors.push(msg);
                issues.push({
                  type: 'INVALID_LINE_RANGE',
                  severity: 'ERROR',
                  lessonId: lesson.id,
                  checkpointId: checkpoint.id,
                  checkpointTitle: checkpoint.title,
                  message: msg,
                  fix: 'Ensure target start line is less than or equal to target end line.',
                });
              }

              if (effective.verificationMode === 'NONE') {
                // Manual completion - no reference snapshot or target file required.
                continue;
              } else if (effective.verificationMode === 'TESTS') {
                const hasTests = Boolean(checkpoint.codingConfig?.testCases && checkpoint.codingConfig.testCases.length > 0);
                if (!hasTests) {
                  const msg = `Video checkpoint "${checkpoint.title}" requires test cases for TESTS verification mode`;
                  errors.push(msg);
                  issues.push({
                    type: 'MISSING_TEST_CASES',
                    severity: 'ERROR',
                    lessonId: lesson.id,
                    checkpointId: checkpoint.id,
                    checkpointTitle: checkpoint.title,
                    message: `This practice step uses Tests verification but has no test cases.`,
                    fix: `Add test cases in the test editor or change verification strategy.`,
                  });
                }
              } else if (effective.verificationMode === 'FILE_COMPARE' || effective.verificationMode === 'CODE_COMPARE') {
                if (!snapshotObj) {
                  const msg = `Video checkpoint "${checkpoint.title}" is missing reference code snapshot for file comparison`;
                  errors.push(msg);
                  issues.push({
                    type: 'MISSING_REFERENCE_SNAPSHOT',
                    severity: 'ERROR',
                    lessonId: lesson.id,
                    checkpointId: checkpoint.id,
                    checkpointTitle: checkpoint.title,
                    message: `This practice step uses File Compare but has no reference code snapshot.`,
                    fix: `Add instructor code to this milestone or change verification to Manual completion.`,
                  });
                } else {
                  const targetPath = effective.targetFilePath ?? checkpoint.practiceTargetFilePath ?? snapshotFiles[0]?.path;
                  if (!targetPath) {
                    const msg = `Video checkpoint "${checkpoint.title}" has no target file for file comparison`;
                    errors.push(msg);
                    issues.push({
                      type: 'MISSING_TARGET_FILE',
                      severity: 'ERROR',
                      lessonId: lesson.id,
                      checkpointId: checkpoint.id,
                      checkpointTitle: checkpoint.title,
                      message: `This practice step uses File Compare but has no target file.`,
                      fix: `Specify a target file or add files to the code snapshot.`,
                    });
                  } else if (!isSafeRelativePath(targetPath)) {
                    const msg = `Video checkpoint "${checkpoint.title}" has an unsafe target file path: "${targetPath}"`;
                    errors.push(msg);
                    issues.push({
                      type: 'UNSAFE_TARGET_FILE',
                      severity: 'ERROR',
                      lessonId: lesson.id,
                      checkpointId: checkpoint.id,
                      checkpointTitle: checkpoint.title,
                      message: msg,
                      fix: 'Use a safe relative file path without directory traversal (..).',
                    });
                  } else if (!snapshotFiles.some((f) => f.path === targetPath)) {
                    const msg = `Video checkpoint "${checkpoint.title}": target file "${targetPath}" does not exist in reference snapshot`;
                    errors.push(msg);
                    issues.push({
                      type: 'TARGET_FILE_NOT_IN_SNAPSHOT',
                      severity: 'ERROR',
                      lessonId: lesson.id,
                      checkpointId: checkpoint.id,
                      checkpointTitle: checkpoint.title,
                      message: `Target file "${targetPath}" does not exist in reference snapshot.`,
                      fix: `Select an existing file from the snapshot as target file or update the snapshot.`,
                    });
                  }
                }
              } else if (effective.verificationMode === 'STRUCTURAL') {
                if (checkpoint.practiceSnapshotId && !snapshotObj) {
                  const msg = `Video checkpoint "${checkpoint.title}" references a missing code snapshot`;
                  errors.push(msg);
                  issues.push({
                    type: 'MISSING_REFERENCE_SNAPSHOT',
                    severity: 'ERROR',
                    lessonId: lesson.id,
                    checkpointId: checkpoint.id,
                    checkpointTitle: checkpoint.title,
                    message: msg,
                    fix: 'Re-attach a valid code snapshot or switch to manual completion.',
                  });
                }

                const { requiredPaths, rules } = parseVerificationRules(checkpoint.practiceVerificationRulesJson);
                const targetPath = effective.targetFilePath ?? checkpoint.practiceTargetFilePath;

                if (targetPath) {
                  if (!isSafeRelativePath(targetPath)) {
                    const msg = `Video checkpoint "${checkpoint.title}" has an unsafe target file path: "${targetPath}"`;
                    errors.push(msg);
                  }
                  if (snapshotObj && snapshotFiles.length > 0 && !snapshotFiles.some((f) => f.path === targetPath)) {
                    const msg = `Video checkpoint "${checkpoint.title}": target file "${targetPath}" does not exist in reference snapshot`;
                    errors.push(msg);
                  }
                }

                for (const path of requiredPaths) {
                  if (!isSafeRelativePath(path)) {
                    errors.push(`Video checkpoint "${checkpoint.title}" has an unsafe required file path: "${path}"`);
                  }
                }

                for (const rule of rules) {
                  if (rule.path && !isSafeRelativePath(rule.path)) {
                    errors.push(`Video checkpoint "${checkpoint.title}" rule has an unsafe path: "${rule.path}"`);
                  }
                  if (!rule.type || rule.type.trim().length === 0) {
                    errors.push(`Video checkpoint "${checkpoint.title}" contains an invalid rule with empty type`);
                  }
                }

                const hasTarget = Boolean(targetPath);
                const hasRules = rules.length > 0;
                const hasSnapshotFiles = snapshotFiles.length > 0;

                if (!hasTarget && !hasRules && !hasSnapshotFiles) {
                  const msg = `Video checkpoint "${checkpoint.title}" has empty structural verification configuration`;
                  errors.push(msg);
                  issues.push({
                    type: 'EMPTY_STRUCTURAL_CONFIG',
                    severity: 'ERROR',
                    lessonId: lesson.id,
                    checkpointId: checkpoint.id,
                    checkpointTitle: checkpoint.title,
                    message: msg,
                    fix: 'Configure structural rules, target file, or reference snapshot.',
                  });
                }
              } else if (effective.verificationMode === 'WORKSPACE_STRUCTURE') {
                if (checkpoint.practiceSnapshotId && !snapshotObj) {
                  const msg = `Video checkpoint "${checkpoint.title}" references a missing code snapshot`;
                  errors.push(msg);
                  issues.push({
                    type: 'MISSING_REFERENCE_SNAPSHOT',
                    severity: 'ERROR',
                    lessonId: lesson.id,
                    checkpointId: checkpoint.id,
                    checkpointTitle: checkpoint.title,
                    message: msg,
                    fix: 'Re-attach a valid code snapshot or switch to manual completion.',
                  });
                }

                const { requiredPaths, rules } = parseVerificationRules(checkpoint.practiceVerificationRulesJson);
                const targetPath = effective.targetFilePath ?? checkpoint.practiceTargetFilePath;

                for (const path of requiredPaths) {
                  if (!isSafeRelativePath(path)) {
                    errors.push(`Video checkpoint "${checkpoint.title}" has an unsafe required path: "${path}"`);
                  }
                }

                for (const rule of rules) {
                  if (rule.path && !isSafeRelativePath(rule.path)) {
                    errors.push(`Video checkpoint "${checkpoint.title}" rule has an unsafe path: "${rule.path}"`);
                  }
                }

                if (targetPath && !isSafeRelativePath(targetPath)) {
                  errors.push(`Video checkpoint "${checkpoint.title}" has an unsafe target file path: "${targetPath}"`);
                }

                const meaningfulRequirement = requiredPaths.length > 0 || rules.length > 0 || Boolean(checkpoint.practiceTargetFilePath);
                if (!meaningfulRequirement) {
                  const msg = `Video checkpoint "${checkpoint.title}" requires at least one required file or rule for WORKSPACE_STRUCTURE verification`;
                  errors.push(msg);
                  issues.push({
                    type: 'EMPTY_WORKSPACE_STRUCTURE',
                    severity: 'ERROR',
                    lessonId: lesson.id,
                    checkpointId: checkpoint.id,
                    checkpointTitle: checkpoint.title,
                    message: msg,
                    fix: 'Add required files or structure rules.',
                  });
                }
              }
            }
          }
        }
      }
    }

    return { errors, issues };
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
