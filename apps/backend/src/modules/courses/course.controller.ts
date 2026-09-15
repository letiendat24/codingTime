import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import {
  createCourseSchema,
  createLessonSchema,
  createModuleSchema,
  instructorCourseListQuerySchema,
  lessonIdParamSchema,
  moduleIdParamSchema,
  paginationSchema,
  reorderLessonsSchema,
  reorderModulesSchema,
  slugParamSchema,
  updateCourseSchema,
  updateLessonSchema,
  updateModuleSchema,
  upsertLessonCodingConfigSchema,
  uuidParamSchema,
} from './course.schemas';
import { CourseService } from './course.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class CourseController {
  constructor(private readonly courses: CourseService) {}

  listCategories = async (_request: Request, response: Response) => {
    response.status(200).json({ categories: await this.courses.listCategories() });
  };

  listTags = async (_request: Request, response: Response) => {
    response.status(200).json({ tags: await this.courses.listTags() });
  };

  listPublishedCourses = async (request: Request, response: Response) => {
    const query = paginationSchema.parse(request.query);
    response.status(200).json(await this.courses.listPublishedCourses(query));
  };

  getPublishedCourse = async (request: Request, response: Response) => {
    const params = slugParamSchema.parse(request.params);
    response.status(200).json({ course: await this.courses.getPublishedCourse(params.slug) });
  };

  createCourse = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const body = createCourseSchema.parse(request.body);
    response.status(201).json({ course: await this.courses.createCourse(auth.userId, body) });
  };

  listInstructorCourses = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const query = instructorCourseListQuerySchema.parse(request.query);
    response.status(200).json(await this.courses.listInstructorCourses(auth.userId, query));
  };

  getInstructorCourse = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = uuidParamSchema.parse(request.params);
    response.status(200).json({ course: await this.courses.getInstructorCourse(auth.userId, params.courseId) });
  };

  updateCourse = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = uuidParamSchema.parse(request.params);
    const body = updateCourseSchema.parse(request.body);
    response.status(200).json({ course: await this.courses.updateCourse(auth.userId, params.courseId, body) });
  };

  publishCourse = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = uuidParamSchema.parse(request.params);
    response.status(200).json({ course: await this.courses.publishCourse(auth.userId, params.courseId) });
  };

  unpublishCourse = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = uuidParamSchema.parse(request.params);
    response.status(200).json({ course: await this.courses.unpublishCourse(auth.userId, params.courseId) });
  };

  archiveCourse = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = uuidParamSchema.parse(request.params);
    response.status(200).json({ course: await this.courses.archiveCourse(auth.userId, params.courseId) });
  };

  createModule = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = uuidParamSchema.parse(request.params);
    const body = createModuleSchema.parse(request.body);
    response.status(201).json({ module: await this.courses.createModule(auth.userId, params.courseId, body) });
  };

  updateModule = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = moduleIdParamSchema.parse(request.params);
    const body = updateModuleSchema.parse(request.body);
    response.status(200).json({ module: await this.courses.updateModule(auth.userId, params.moduleId, body) });
  };

  deleteModule = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = moduleIdParamSchema.parse(request.params);
    await this.courses.deleteModule(auth.userId, params.moduleId);
    response.status(204).send();
  };

  reorderModules = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = uuidParamSchema.parse(request.params);
    const body = reorderModulesSchema.parse(request.body);
    await this.courses.reorderModules(auth.userId, params.courseId, body.moduleIds);
    response.status(204).send();
  };

  createLesson = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = moduleIdParamSchema.parse(request.params);
    const body = createLessonSchema.parse(request.body);
    response.status(201).json({ lesson: await this.courses.createLesson(auth.userId, params.moduleId, body) });
  };

  updateLesson = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    const body = updateLessonSchema.parse(request.body);
    response.status(200).json({ lesson: await this.courses.updateLesson(auth.userId, params.lessonId, body) });
  };

  deleteLesson = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    await this.courses.deleteLesson(auth.userId, params.lessonId);
    response.status(204).send();
  };

  getLessonCodingConfig = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json(await this.courses.getLessonCodingConfig(auth.userId, params.lessonId));
  };

  upsertLessonCodingConfig = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    const body = upsertLessonCodingConfigSchema.parse(request.body);
    response.status(200).json(await this.courses.upsertLessonCodingConfig(auth.userId, params.lessonId, body));
  };

  reorderLessons = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = moduleIdParamSchema.parse(request.params);
    const body = reorderLessonsSchema.parse(request.body);
    await this.courses.reorderLessons(auth.userId, params.moduleId, body.lessonIds);
    response.status(204).send();
  };
}
