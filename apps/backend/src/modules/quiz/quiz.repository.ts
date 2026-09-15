import { CourseStatus, QuizAttemptStatus, type Prisma, type PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const quizInclude = {
  questions: {
    include: {
      options: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.QuizInclude;

export const attemptInclude = {
  quiz: {
    include: quizInclude,
  },
  answers: {
    include: {
      question: {
        include: {
          options: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        },
      },
      selectedOptions: {
        include: {
          option: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.QuizAttemptInclude;

export type QuizWithQuestions = Prisma.QuizGetPayload<{ include: typeof quizInclude }>;
export type QuizAttemptWithAnswers = Prisma.QuizAttemptGetPayload<{ include: typeof attemptInclude }>;

export class QuizRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findLessonForInstructor(instructorId: string, lessonId: string) {
    return this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        module: { course: { ownerInstructorId: instructorId } },
      },
      include: { module: { include: { course: true } }, quiz: { include: quizInclude } },
    });
  }

  async findQuizForInstructor(instructorId: string, quizId: string) {
    return this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        lesson: { module: { course: { ownerInstructorId: instructorId } } },
      },
      include: quizInclude,
    });
  }

  async findQuestionForInstructor(instructorId: string, quizId: string, questionId: string) {
    return this.prisma.quizQuestion.findFirst({
      where: {
        id: questionId,
        quizId,
        quiz: { lesson: { module: { course: { ownerInstructorId: instructorId } } } },
      },
      include: { options: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  async upsertQuiz(input: {
    readonly lessonId: string;
    readonly title: string;
    readonly instructions: string | null;
    readonly passScore: Prisma.Decimal;
    readonly shuffleQuestions: boolean;
    readonly shuffleOptions: boolean;
    readonly showResultImmediately: boolean;
  }) {
    return this.prisma.quiz.upsert({
      where: { lessonId: input.lessonId },
      create: input,
      update: {
        title: input.title,
        instructions: input.instructions,
        passScore: input.passScore,
        shuffleQuestions: input.shuffleQuestions,
        shuffleOptions: input.shuffleOptions,
        showResultImmediately: input.showResultImmediately,
      },
      include: quizInclude,
    });
  }

  async createQuestion(input: {
    readonly quizId: string;
    readonly type: Prisma.QuizQuestionCreateInput['type'];
    readonly prompt: string;
    readonly explanation: string | null;
    readonly points: Prisma.Decimal;
    readonly position: number;
    readonly options: readonly {
      readonly text: string;
      readonly isCorrect: boolean;
      readonly position: number;
    }[];
  }) {
    return this.prisma.quizQuestion.create({
      data: {
        quizId: input.quizId,
        type: input.type,
        prompt: input.prompt,
        explanation: input.explanation,
        points: input.points,
        position: input.position,
        options: {
          create: input.options.map((option) => ({
            text: option.text,
            isCorrect: option.isCorrect,
            position: option.position,
          })),
        },
      },
      include: { options: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  async updateQuestion(input: {
    readonly questionId: string;
    readonly type?: Prisma.QuizQuestionUpdateInput['type'];
    readonly prompt?: string;
    readonly explanation?: string | null;
    readonly points?: Prisma.Decimal;
    readonly position?: number;
    readonly options?: readonly {
      readonly text: string;
      readonly isCorrect: boolean;
      readonly position: number;
    }[];
  }) {
    if (input.options) {
      await this.prisma.quizOption.deleteMany({ where: { questionId: input.questionId } });
    }

    return this.prisma.quizQuestion.update({
      where: { id: input.questionId },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
        ...(input.points !== undefined ? { points: input.points } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.options
          ? {
              options: {
                create: input.options.map((option) => ({
                  text: option.text,
                  isCorrect: option.isCorrect,
                  position: option.position,
                })),
              },
            }
          : {}),
      },
      include: { options: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  async deleteQuestion(questionId: string) {
    await this.prisma.quizQuestion.delete({ where: { id: questionId } });
  }

  async setQuestionPosition(questionId: string, position: number) {
    await this.prisma.quizQuestion.update({ where: { id: questionId }, data: { position } });
  }

  async nextQuestionPosition(quizId: string) {
    const aggregate = await this.prisma.quizQuestion.aggregate({
      where: { quizId },
      _max: { position: true },
    });

    return (aggregate._max.position ?? 0) + 1;
  }

  async findStudentQuizByLesson(studentId: string, lessonId: string) {
    return this.prisma.quiz.findFirst({
      where: {
        lessonId,
        lesson: {
          lessonType: 'QUIZ',
          module: {
            course: {
              status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
              enrollments: { some: { studentId, status: { not: 'CANCELLED' } } },
            },
          },
        },
      },
      include: quizInclude,
    });
  }

  async findStudentQuiz(studentId: string, quizId: string) {
    return this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        lesson: {
          lessonType: 'QUIZ',
          module: {
            course: {
              status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
              enrollments: { some: { studentId, status: { not: 'CANCELLED' } } },
            },
          },
        },
      },
      include: quizInclude,
    });
  }

  async findInProgressAttempt(studentId: string, quizId: string) {
    return this.prisma.quizAttempt.findFirst({
      where: { userId: studentId, quizId, status: QuizAttemptStatus.IN_PROGRESS },
      include: attemptInclude,
      orderBy: { startedAt: 'desc' },
    });
  }

  async createAttempt(studentId: string, quizId: string) {
    return this.prisma.quizAttempt.create({
      data: { userId: studentId, quizId },
      include: attemptInclude,
    });
  }

  async findAttemptForUser(studentId: string, attemptId: string) {
    return this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, userId: studentId },
      include: attemptInclude,
    });
  }

  async listAttemptsForQuiz(studentId: string, quizId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { userId: studentId, quizId },
      include: {
        answers: true,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async replaceAttemptAnswers(input: {
    readonly attemptId: string;
    readonly answers: readonly {
      readonly questionId: string;
      readonly isCorrect: boolean;
      readonly scoreEarned: Prisma.Decimal;
      readonly selectedOptionIds: readonly string[];
    }[];
  }) {
    await this.prisma.quizAttemptAnswer.deleteMany({ where: { attemptId: input.attemptId } });

    for (const answer of input.answers) {
      await this.prisma.quizAttemptAnswer.create({
        data: {
          attemptId: input.attemptId,
          questionId: answer.questionId,
          isCorrect: answer.isCorrect,
          scoreEarned: answer.scoreEarned,
          selectedOptions: {
            create: answer.selectedOptionIds.map((optionId) => ({ optionId })),
          },
        },
      });
    }
  }

  async submitAttempt(input: {
    readonly attemptId: string;
    readonly submittedAt: Date;
    readonly score: Prisma.Decimal;
    readonly maxScore: Prisma.Decimal;
    readonly percentage: Prisma.Decimal;
    readonly passed: boolean;
  }) {
    return this.prisma.quizAttempt.update({
      where: { id: input.attemptId },
      data: {
        status: QuizAttemptStatus.SUBMITTED,
        submittedAt: input.submittedAt,
        score: input.score,
        maxScore: input.maxScore,
        percentage: input.percentage,
        passed: input.passed,
      },
      include: attemptInclude,
    });
  }
}
