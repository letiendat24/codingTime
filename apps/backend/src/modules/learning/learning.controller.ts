import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import { courseIdParamSchema, learningHistoryQuerySchema, lessonIdParamSchema } from './learning.schemas';
import { LearningService } from './learning.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class LearningController {
  constructor(private readonly learning: LearningService) {}

  accessLesson = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json({ lessonProgress: await this.learning.accessLesson(auth.userId, params.lessonId) });
  };

  completeLesson = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json({ lessonProgress: await this.learning.completeLesson(auth.userId, params.lessonId) });
  };

  resume = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    response.status(200).json(await this.learning.getResumeLearning(auth.userId));
  };

  courseProgress = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = courseIdParamSchema.parse(request.params);
    response.status(200).json(await this.learning.getCourseProgress(auth.userId, params.courseId));
  };

  history = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const query = learningHistoryQuerySchema.parse(request.query);
    response.status(200).json(await this.learning.listHistory(auth.userId, query));
  };

  dashboard = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    response.status(200).json(await this.learning.getDashboard(auth.userId));
  };
}
