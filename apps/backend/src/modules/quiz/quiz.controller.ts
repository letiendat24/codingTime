import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import {
  attemptIdParamSchema,
  lessonIdParamSchema,
  questionIdParamSchema,
  quizIdParamSchema,
  quizQuestionInputSchema,
  reorderQuizQuestionsSchema,
  submitQuizAttemptSchema,
  updateQuizQuestionSchema,
  upsertQuizSchema,
} from './quiz.schemas';
import type { QuizService } from './quiz.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class QuizController {
  constructor(private readonly quizzes: QuizService) {}

  getInstructorQuiz = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json(await this.quizzes.getInstructorQuiz(auth.userId, params.lessonId));
  };

  upsertInstructorQuiz = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    const body = upsertQuizSchema.parse(request.body);
    response.status(200).json(await this.quizzes.upsertInstructorQuiz(auth.userId, params.lessonId, body));
  };

  createQuestion = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = quizIdParamSchema.parse(request.params);
    const body = quizQuestionInputSchema.parse(request.body);
    response.status(201).json(await this.quizzes.createQuestion(auth.userId, params.quizId, body));
  };

  updateQuestion = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const quizParams = quizIdParamSchema.parse(request.params);
    const questionParams = questionIdParamSchema.parse(request.params);
    const body = updateQuizQuestionSchema.parse(request.body);
    response.status(200).json(await this.quizzes.updateQuestion(auth.userId, quizParams.quizId, questionParams.questionId, body));
  };

  deleteQuestion = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const quizParams = quizIdParamSchema.parse(request.params);
    const questionParams = questionIdParamSchema.parse(request.params);
    await this.quizzes.deleteQuestion(auth.userId, quizParams.quizId, questionParams.questionId);
    response.status(204).send();
  };

  reorderQuestions = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = quizIdParamSchema.parse(request.params);
    const body = reorderQuizQuestionsSchema.parse(request.body);
    await this.quizzes.reorderQuestions(auth.userId, params.quizId, body.orderedIds);
    response.status(204).send();
  };

  getStudentQuiz = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json(await this.quizzes.getStudentQuiz(auth.userId, params.lessonId));
  };

  startAttempt = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = quizIdParamSchema.parse(request.params);
    response.status(201).json(await this.quizzes.startAttempt(auth.userId, params.quizId));
  };

  getAttempt = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = attemptIdParamSchema.parse(request.params);
    response.status(200).json(await this.quizzes.getAttempt(auth.userId, params.attemptId));
  };

  submitAttempt = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = attemptIdParamSchema.parse(request.params);
    const body = submitQuizAttemptSchema.parse(request.body);
    response.status(200).json(await this.quizzes.submitAttempt(auth.userId, params.attemptId, body));
  };
}
