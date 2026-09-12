import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import { courseIdParamSchema, myCoursesQuerySchema } from './enrollment.schemas';
import { EnrollmentService } from './enrollment.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class EnrollmentController {
  constructor(private readonly enrollments: EnrollmentService) {}

  enroll = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = courseIdParamSchema.parse(request.params);
    response.status(201).json({ enrollment: await this.enrollments.enroll(auth.userId, params.courseId) });
  };

  listMyCourses = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const query = myCoursesQuerySchema.parse(request.query);
    response.status(200).json(await this.enrollments.listMyCourses(auth.userId, query));
  };
}
