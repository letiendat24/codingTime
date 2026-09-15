import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { QuizController } from './quiz.controller';

export function createInstructorQuizRouter(controller: QuizController, tokenService: TokenService) {
  const router = Router();
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)] as const;

  router.get('/lessons/:lessonId/quiz', ...instructorOnly, asyncHandler(controller.getInstructorQuiz));
  router.put('/lessons/:lessonId/quiz', ...instructorOnly, asyncHandler(controller.upsertInstructorQuiz));
  router.post('/quizzes/:quizId/questions', ...instructorOnly, asyncHandler(controller.createQuestion));
  router.post('/quizzes/:quizId/questions/reorder', ...instructorOnly, asyncHandler(controller.reorderQuestions));
  router.patch('/quizzes/:quizId/questions/:questionId', ...instructorOnly, asyncHandler(controller.updateQuestion));
  router.delete('/quizzes/:quizId/questions/:questionId', ...instructorOnly, asyncHandler(controller.deleteQuestion));

  return router;
}

export function createStudentQuizRouter(controller: QuizController, tokenService: TokenService) {
  const router = Router();
  const studentOnly = [requireAuth(tokenService), requireRole(RoleName.STUDENT)] as const;

  router.get('/lessons/:lessonId/quiz', ...studentOnly, asyncHandler(controller.getStudentQuiz));
  router.post('/quizzes/:quizId/attempts', ...studentOnly, asyncHandler(controller.startAttempt));
  router.get('/quiz-attempts/:attemptId', ...studentOnly, asyncHandler(controller.getAttempt));
  router.post('/quiz-attempts/:attemptId/submit', ...studentOnly, asyncHandler(controller.submitAttempt));

  return router;
}
