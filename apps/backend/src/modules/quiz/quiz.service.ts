import {
  LessonType,
  Prisma,
  QuizAttemptStatus,
  QuizQuestionType,
  type PrismaClient,
} from '@prisma/client';
import { LearningService } from '../learning/learning.service';
import {
  quizAccessDenied,
  quizAttemptAlreadySubmitted,
  quizAttemptNotFound,
  quizLessonInvalid,
  quizNotConfigured,
  quizNotFound,
  quizQuestionNotFound,
  quizValidationFailed,
} from './quiz.errors';
import { QuizRepository, type QuizAttemptWithAnswers, type QuizWithQuestions } from './quiz.repository';
import type {
  QuizQuestionInput,
  SubmitQuizAttemptInput,
  UpdateQuizQuestionInput,
  UpsertQuizInput,
} from './quiz.schemas';

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function roundPercentage(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizedSet(values: readonly string[]) {
  return new Set(values);
}

function setsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }

  return true;
}

function validateQuestionPayload(input: QuizQuestionInput | UpdateQuizQuestionInput) {
  const errors: string[] = [];

  if (input.prompt !== undefined && !input.prompt.trim()) {
    errors.push('Question prompt is required');
  }

  if (input.points !== undefined && input.points <= 0) {
    errors.push('Question points must be greater than zero');
  }

  if (input.options) {
    if (input.options.length < 2) {
      errors.push('Question must have at least 2 options');
    }

    const correctCount = input.options.filter((option) => option.isCorrect).length;

    if (input.type === QuizQuestionType.SINGLE_CHOICE && correctCount !== 1) {
      errors.push('Single choice questions must have exactly one correct option');
    }

    if (input.type === QuizQuestionType.MULTIPLE_CHOICE) {
      if (correctCount < 1) {
        errors.push('Multiple choice questions must have at least one correct option');
      }

      if (correctCount === input.options.length) {
        errors.push('Multiple choice questions must include at least one incorrect option');
      }
    }
  }

  if (errors.length > 0) {
    throw quizValidationFailed(errors);
  }
}

function validateQuizForPublish(quiz: QuizWithQuestions | null) {
  const errors: string[] = [];

  if (!quiz) {
    return ['Quiz lesson must have quiz settings'];
  }

  if (quiz.questions.length === 0) {
    errors.push('Quiz must contain at least one question');
  }

  for (const question of quiz.questions) {
    if (!question.prompt.trim()) {
      errors.push('Quiz question prompt is required');
    }

    if (Number(question.points) <= 0) {
      errors.push(`Quiz question "${question.prompt}" must have positive points`);
    }

    if (question.options.length < 2) {
      errors.push(`Quiz question "${question.prompt}" must have at least 2 options`);
    }

    const correctCount = question.options.filter((option) => option.isCorrect).length;

    if (question.type === QuizQuestionType.SINGLE_CHOICE && correctCount !== 1) {
      errors.push(`Quiz question "${question.prompt}" must have exactly one correct option`);
    }

    if (question.type === QuizQuestionType.MULTIPLE_CHOICE) {
      if (correctCount < 1) {
        errors.push(`Quiz question "${question.prompt}" must have at least one correct option`);
      }

      if (correctCount === question.options.length) {
        errors.push(`Quiz question "${question.prompt}" must include at least one incorrect option`);
      }
    }
  }

  return errors;
}

function mapInstructorQuiz(quiz: QuizWithQuestions) {
  return {
    id: quiz.id,
    lessonId: quiz.lessonId,
    title: quiz.title,
    instructions: quiz.instructions,
    passScore: Number(quiz.passScore),
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleOptions: quiz.shuffleOptions,
    showResultImmediately: quiz.showResultImmediately,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation,
      points: Number(question.points),
      position: question.position,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
        position: option.position,
      })),
    })),
  };
}

function mapStudentQuiz(quiz: QuizWithQuestions, attempts: Awaited<ReturnType<QuizRepository['listAttemptsForQuiz']>>) {
  return {
    id: quiz.id,
    lessonId: quiz.lessonId,
    title: quiz.title,
    instructions: quiz.instructions,
    passScore: Number(quiz.passScore),
    questionCount: quiz.questions.length,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      points: Number(question.points),
      position: question.position,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        position: option.position,
      })),
    })),
    attempts: attempts.map((attempt, index, list) => ({
      id: attempt.id,
      attemptNumber: list.length - index,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      score: toNumber(attempt.score),
      maxScore: toNumber(attempt.maxScore),
      percentage: toNumber(attempt.percentage),
      passed: attempt.passed,
    })),
  };
}

function mapAttempt(attempt: QuizAttemptWithAnswers) {
  const showDetailedResult = attempt.status === QuizAttemptStatus.SUBMITTED && attempt.quiz.showResultImmediately;

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    score: toNumber(attempt.score),
    maxScore: toNumber(attempt.maxScore),
    percentage: toNumber(attempt.percentage),
    passed: attempt.passed,
    showDetailedResult,
    answers: attempt.answers.map((answer) => {
      const selectedOptionIds = answer.selectedOptions.map((selection) => selection.optionId);
      const base = {
        questionId: answer.questionId,
        selectedOptionIds,
      };

      if (!showDetailedResult) {
        return base;
      }

      return {
        ...base,
        isCorrect: answer.isCorrect,
        scoreEarned: toNumber(answer.scoreEarned),
        correctOptionIds: answer.question.options.filter((option) => option.isCorrect).map((option) => option.id),
        explanation: answer.question.explanation,
      };
    }),
  };
}

function normalizeOptions(input: QuizQuestionInput | UpdateQuizQuestionInput) {
  return input.options?.map((option, index) => ({
    text: option.text,
    isCorrect: option.isCorrect,
    position: option.position ?? index + 1,
  }));
}

export class QuizService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly quizzes: QuizRepository,
    private readonly learning: LearningService,
  ) {}

  async getInstructorQuiz(instructorId: string, lessonId: string) {
    const lesson = await this.quizzes.findLessonForInstructor(instructorId, lessonId);

    if (!lesson) {
      throw quizAccessDenied();
    }

    if (lesson.lessonType !== LessonType.QUIZ) {
      throw quizLessonInvalid();
    }

    return { quiz: lesson.quiz ? mapInstructorQuiz(lesson.quiz) : null };
  }

  async upsertInstructorQuiz(instructorId: string, lessonId: string, input: UpsertQuizInput) {
    const lesson = await this.quizzes.findLessonForInstructor(instructorId, lessonId);

    if (!lesson) {
      throw quizAccessDenied();
    }

    if (lesson.lessonType !== LessonType.QUIZ) {
      throw quizLessonInvalid();
    }

    const quiz = await this.quizzes.upsertQuiz({
      lessonId,
      title: input.title,
      instructions: input.instructions ?? null,
      passScore: new Prisma.Decimal(input.passScore),
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
      showResultImmediately: input.showResultImmediately,
    });

    return { quiz: mapInstructorQuiz(quiz) };
  }

  async createQuestion(instructorId: string, quizId: string, input: QuizQuestionInput) {
    const quiz = await this.quizzes.findQuizForInstructor(instructorId, quizId);

    if (!quiz) {
      throw quizNotFound();
    }

    validateQuestionPayload(input);

    const question = await this.quizzes.createQuestion({
      quizId,
      type: input.type,
      prompt: input.prompt,
      explanation: input.explanation ?? null,
      points: new Prisma.Decimal(input.points),
      position: input.position ?? (await this.quizzes.nextQuestionPosition(quizId)),
      options: normalizeOptions(input) ?? [],
    });

    return { question };
  }

  async updateQuestion(instructorId: string, quizId: string, questionId: string, input: UpdateQuizQuestionInput) {
    const question = await this.quizzes.findQuestionForInstructor(instructorId, quizId, questionId);

    if (!question) {
      throw quizQuestionNotFound();
    }

    const merged = {
      type: input.type ?? question.type,
      prompt: input.prompt ?? question.prompt,
      explanation: input.explanation ?? question.explanation,
      points: input.points ?? Number(question.points),
      options: input.options ?? question.options.map((option) => ({
        text: option.text,
        isCorrect: option.isCorrect,
        position: option.position,
      })),
    };
    validateQuestionPayload(merged);

    const updated = await this.quizzes.updateQuestion({
      questionId,
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.explanation !== undefined ? { explanation: input.explanation ?? null } : {}),
      ...(input.points !== undefined ? { points: new Prisma.Decimal(input.points) } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.options !== undefined ? { options: normalizeOptions(input) ?? [] } : {}),
    });

    return { question: updated };
  }

  async deleteQuestion(instructorId: string, quizId: string, questionId: string) {
    const question = await this.quizzes.findQuestionForInstructor(instructorId, quizId, questionId);

    if (!question) {
      throw quizQuestionNotFound();
    }

    await this.quizzes.deleteQuestion(questionId);
  }

  async reorderQuestions(instructorId: string, quizId: string, orderedIds: readonly string[]) {
    const quiz = await this.quizzes.findQuizForInstructor(instructorId, quizId);

    if (!quiz || quiz.questions.length !== orderedIds.length || quiz.questions.some((question) => !orderedIds.includes(question.id))) {
      throw quizValidationFailed(['Question ordering payload does not match existing questions']);
    }

    if (new Set(orderedIds).size !== orderedIds.length) {
      throw quizValidationFailed(['Question ordering payload contains duplicate ids']);
    }

    await this.prisma.$transaction(async (transaction) => {
      const repository = new QuizRepository(transaction);

      for (const [index, questionId] of orderedIds.entries()) {
        await repository.setQuestionPosition(questionId, -(index + 1));
      }

      for (const [index, questionId] of orderedIds.entries()) {
        await repository.setQuestionPosition(questionId, index + 1);
      }
    });
  }

  async getStudentQuiz(studentId: string, lessonId: string) {
    const quiz = await this.quizzes.findStudentQuizByLesson(studentId, lessonId);

    if (!quiz) {
      throw quizNotConfigured();
    }

    const attempts = await this.quizzes.listAttemptsForQuiz(studentId, quiz.id);
    return { quiz: mapStudentQuiz(quiz, attempts) };
  }

  async startAttempt(studentId: string, quizId: string) {
    const quiz = await this.quizzes.findStudentQuiz(studentId, quizId);

    if (!quiz) {
      throw quizNotFound();
    }

    const existing = await this.quizzes.findInProgressAttempt(studentId, quizId);
    const attempt = existing ?? await this.quizzes.createAttempt(studentId, quizId);

    return { attempt: mapAttempt(attempt) };
  }

  async getAttempt(studentId: string, attemptId: string) {
    const attempt = await this.quizzes.findAttemptForUser(studentId, attemptId);

    if (!attempt) {
      throw quizAttemptNotFound();
    }

    return { attempt: mapAttempt(attempt) };
  }

  async submitAttempt(studentId: string, attemptId: string, input: SubmitQuizAttemptInput) {
    const attempt = await this.quizzes.findAttemptForUser(studentId, attemptId);

    if (!attempt) {
      throw quizAttemptNotFound();
    }

    if (attempt.status === QuizAttemptStatus.SUBMITTED) {
      throw quizAttemptAlreadySubmitted();
    }

    const answersByQuestion = new Map(input.answers.map((answer) => [answer.questionId, answer.selectedOptionIds]));
    const gradedAnswers = attempt.quiz.questions.map((question) => {
      const selectedOptionIds = answersByQuestion.get(question.id) ?? [];
      const validOptionIds = new Set(question.options.map((option) => option.id));
      const selected = selectedOptionIds.filter((optionId, index, list) => validOptionIds.has(optionId) && list.indexOf(optionId) === index);
      const correct = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const isCorrect = setsEqual(normalizedSet(selected), normalizedSet(correct));
      const scoreEarned = isCorrect ? Number(question.points) : 0;

      return {
        questionId: question.id,
        isCorrect,
        scoreEarned,
        selectedOptionIds: selected,
      };
    });

    const score = gradedAnswers.reduce((sum, answer) => sum + answer.scoreEarned, 0);
    const maxScore = attempt.quiz.questions.reduce((sum, question) => sum + Number(question.points), 0);
    const percentage = maxScore <= 0 ? 0 : roundPercentage((score / maxScore) * 100);
    const passed = percentage >= Number(attempt.quiz.passScore);

    const submitted = await this.prisma.$transaction(async (transaction) => {
      const repository = new QuizRepository(transaction);
      await repository.replaceAttemptAnswers({
        attemptId,
        answers: gradedAnswers.map((answer) => ({
          questionId: answer.questionId,
          isCorrect: answer.isCorrect,
          scoreEarned: new Prisma.Decimal(answer.scoreEarned),
          selectedOptionIds: answer.selectedOptionIds,
        })),
      });

      return repository.submitAttempt({
        attemptId,
        submittedAt: new Date(),
        score: new Prisma.Decimal(score),
        maxScore: new Prisma.Decimal(maxScore),
        percentage: new Prisma.Decimal(percentage),
        passed,
      });
    });

    if (passed) {
      await this.learning.completeLesson(studentId, submitted.quiz.lessonId);
    }

    return { attempt: mapAttempt(submitted) };
  }

  static validateQuizForPublish(quiz: QuizWithQuestions | null) {
    return validateQuizForPublish(quiz);
  }
}
