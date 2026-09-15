import { QuizQuestionType } from '@prisma/client';
import { z } from 'zod';

export const lessonIdParamSchema = z.object({
  lessonId: z.string().uuid(),
});

export const quizIdParamSchema = z.object({
  quizId: z.string().uuid(),
});

export const questionIdParamSchema = z.object({
  questionId: z.string().uuid(),
});

export const attemptIdParamSchema = z.object({
  attemptId: z.string().uuid(),
});

export const upsertQuizSchema = z.object({
  title: z.string().trim().min(1).max(180),
  instructions: z.string().trim().max(20_000).nullable().optional(),
  passScore: z.number().min(0).max(100),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showResultImmediately: z.boolean().default(true),
});

export const quizOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(2_000),
  isCorrect: z.boolean().default(false),
  position: z.number().int().min(1).optional(),
});

export const quizQuestionInputSchema = z.object({
  type: z.nativeEnum(QuizQuestionType),
  prompt: z.string().trim().min(1).max(10_000),
  explanation: z.string().trim().max(20_000).nullable().optional(),
  points: z.number().positive().max(1_000),
  position: z.number().int().min(1).optional(),
  options: z.array(quizOptionInputSchema).min(2).max(12),
});

export const updateQuizQuestionSchema = quizQuestionInputSchema.partial().extend({
  options: z.array(quizOptionInputSchema).min(2).max(12).optional(),
});

export const reorderQuizQuestionsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const submitQuizAttemptSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selectedOptionIds: z.array(z.string().uuid()).max(12).default([]),
    }),
  ),
});

export type UpsertQuizInput = z.infer<typeof upsertQuizSchema>;
export type QuizQuestionInput = z.infer<typeof quizQuestionInputSchema>;
export type UpdateQuizQuestionInput = z.infer<typeof updateQuizQuestionSchema>;
export type SubmitQuizAttemptInput = z.infer<typeof submitQuizAttemptSchema>;
