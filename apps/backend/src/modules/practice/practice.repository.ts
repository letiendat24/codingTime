import { PracticeProblemStatus, Prisma, type PrismaClient } from '@prisma/client';
import type { InstructorPracticeListQuery, StudentPracticeListQuery } from './practice.schemas';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const practiceProblemInclude = {
  createdBy: true,
  tags: { include: { tag: true }, orderBy: { tag: { name: 'asc' } } },
  testCases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.PracticeProblemInclude;

function skip(page: number, limit: number) {
  return (page - 1) * limit;
}

function search(search: string | undefined): Prisma.PracticeProblemWhereInput {
  if (!search) {
    return {};
  }

  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ],
  };
}

export class PracticeRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async createProblem(data: Prisma.PracticeProblemUncheckedCreateInput) {
    return this.prisma.practiceProblem.create({ data, include: practiceProblemInclude });
  }

  async findInstructorProblem(instructorId: string, problemId: string) {
    return this.prisma.practiceProblem.findFirst({
      where: { id: problemId, createdByUserId: instructorId },
      include: practiceProblemInclude,
    });
  }

  async updateProblem(problemId: string, data: Prisma.PracticeProblemUpdateInput) {
    return this.prisma.practiceProblem.update({ where: { id: problemId }, data, include: practiceProblemInclude });
  }

  async listInstructorProblems(instructorId: string, query: InstructorPracticeListQuery) {
    const where: Prisma.PracticeProblemWhereInput = {
      createdByUserId: instructorId,
      ...search(query.search),
      ...(query.status ? { status: query.status } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.practiceProblem.findMany({
        where,
        include: practiceProblemInclude,
        orderBy: { createdAt: 'desc' },
        skip: skip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.practiceProblem.count({ where }),
    ]);

    return { items, total };
  }

  async listStudentProblems(studentId: string, query: StudentPracticeListQuery) {
    const where: Prisma.PracticeProblemWhereInput = {
      status: PracticeProblemStatus.PUBLISHED,
      ...search(query.search),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.language ? { language: query.language.toLowerCase() } : {}),
      ...(query.tag ? { tags: { some: { tag: { slug: query.tag } } } } : {}),
      ...(query.status ? { progress: { some: { studentId, status: query.status } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.practiceProblem.findMany({
        where,
        include: {
          createdBy: true,
          tags: { include: { tag: true }, orderBy: { tag: { name: 'asc' } } },
          progress: { where: { studentId }, take: 1 },
          _count: { select: { testCases: true } },
        },
        orderBy: [{ difficulty: 'asc' }, { publishedAt: 'desc' }],
        skip: skip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.practiceProblem.count({ where }),
    ]);

    return { items, total };
  }

  async findStudentProblemBySlug(studentId: string, slug: string) {
    return this.prisma.practiceProblem.findFirst({
      where: { slug, status: PracticeProblemStatus.PUBLISHED },
      include: {
        createdBy: true,
        tags: { include: { tag: true }, orderBy: { tag: { name: 'asc' } } },
        testCases: {
          where: { visibility: 'PUBLIC' },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
        progress: { where: { studentId }, take: 1 },
      },
    });
  }

  async findPublishedProblem(problemId: string) {
    return this.prisma.practiceProblem.findFirst({
      where: { id: problemId, status: PracticeProblemStatus.PUBLISHED },
      include: practiceProblemInclude,
    });
  }

  async upsertTags(problemId: string, names: readonly string[]) {
    await this.prisma.practiceProblemTag.deleteMany({ where: { problemId } });
    for (const name of names) {
      const trimmed = name.trim();
      const slug = trimmed.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '');
      if (!slug) {
        continue;
      }
      const tag = await this.prisma.practiceTag.upsert({
        where: { slug },
        update: { name: trimmed },
        create: { name: trimmed, slug },
      });
      await this.prisma.practiceProblemTag.create({ data: { problemId, tagId: tag.id } });
    }
  }

  async listTags() {
    return this.prisma.practiceTag.findMany({
      where: { problems: { some: { problem: { status: PracticeProblemStatus.PUBLISHED } } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTestCase(problemId: string, data: Omit<Prisma.PracticeProblemTestCaseUncheckedCreateInput, 'practiceProblemId'>) {
    return this.prisma.practiceProblemTestCase.create({ data: { ...data, practiceProblemId: problemId } });
  }

  async findTestCaseForInstructor(instructorId: string, testCaseId: string) {
    return this.prisma.practiceProblemTestCase.findFirst({
      where: { id: testCaseId, problem: { createdByUserId: instructorId } },
      include: { problem: true },
    });
  }

  async updateTestCase(testCaseId: string, data: Prisma.PracticeProblemTestCaseUpdateInput) {
    return this.prisma.practiceProblemTestCase.update({ where: { id: testCaseId }, data });
  }

  async deleteTestCase(testCaseId: string) {
    await this.prisma.practiceProblemTestCase.delete({ where: { id: testCaseId } });
  }

  async setTestCasePosition(testCaseId: string, position: number) {
    await this.prisma.practiceProblemTestCase.update({ where: { id: testCaseId }, data: { position } });
  }

  async listTestCases(problemId: string) {
    return this.prisma.practiceProblemTestCase.findMany({
      where: { practiceProblemId: problemId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upsertPracticeWorkspace(input: {
    readonly userId: string;
    readonly problemId: string;
    readonly language: string;
    readonly entryFile: string;
    readonly files: readonly { readonly path: string; readonly content: string }[];
    readonly now: Date;
  }) {
    const existing = await this.prisma.workspace.findFirst({
      where: { userId: input.userId, practiceProblemId: input.problemId },
    });

    if (existing) {
      await this.prisma.workspace.update({ where: { id: existing.id }, data: { lastOpenedAt: input.now } });
      return this.findWorkspace(input.userId, existing.id);
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        userId: input.userId,
        practiceProblemId: input.problemId,
        language: input.language,
        entryFile: input.entryFile,
        lastOpenedAt: input.now,
        files: { create: input.files.map((file) => ({ path: file.path, content: file.content })) },
      },
    });

    return this.findWorkspace(input.userId, workspace.id);
  }

  async findWorkspace(userId: string, workspaceId: string) {
    return this.prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
      include: { files: { orderBy: { path: 'asc' } } },
    });
  }

  async findPracticeWorkspace(userId: string, problemId: string) {
    return this.prisma.workspace.findFirst({
      where: { userId, practiceProblemId: problemId },
      include: { files: { orderBy: { path: 'asc' } } },
    });
  }

  async resetPracticeWorkspace(input: {
    readonly userId: string;
    readonly workspaceId: string;
    readonly files: readonly { readonly path: string; readonly content: string }[];
  }) {
    await this.prisma.workspaceFile.deleteMany({ where: { workspaceId: input.workspaceId, workspace: { userId: input.userId } } });
    await this.prisma.workspaceFile.createMany({
      data: input.files.map((file) => ({ workspaceId: input.workspaceId, path: file.path, content: file.content })),
    });
    return this.findWorkspace(input.userId, input.workspaceId);
  }

  async createWorkspaceRevision(input: {
    readonly workspaceId: string;
    readonly filesJson: Prisma.InputJsonValue;
  }) {
    return this.prisma.workspaceRevision.create({
      data: { workspaceId: input.workspaceId, source: 'AUTO_BEFORE_PRACTICE_RESET', filesJson: input.filesJson },
    });
  }

  async listSubmissionsForProblem(userId: string, problemId: string, input: { readonly skip: number; readonly take: number }) {
    const where: Prisma.JudgeSubmissionWhereInput = { userId, practiceProblemId: problemId };
    const [items, total] = await Promise.all([
      this.prisma.judgeSubmission.findMany({
        where,
        include: { result: true },
        orderBy: { submittedAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.judgeSubmission.count({ where }),
    ]);

    return { items, total };
  }

  async getStats(userId: string) {
    const [totalProblems, attempted, solved, recent] = await Promise.all([
      this.prisma.practiceProblem.count({ where: { status: PracticeProblemStatus.PUBLISHED } }),
      this.prisma.practiceProgress.count({ where: { studentId: userId, status: { in: ['ATTEMPTED', 'SOLVED'] } } }),
      this.prisma.practiceProgress.count({ where: { studentId: userId, status: 'SOLVED' } }),
      this.prisma.practiceProgress.findMany({
        where: { studentId: userId },
        orderBy: { lastAttemptedAt: 'desc' },
        take: 5,
        include: { problem: true },
      }),
    ]);

    return { totalProblems, attempted, solved, recent };
  }
}
