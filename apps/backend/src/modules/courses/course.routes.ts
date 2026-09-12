import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { CourseController } from './course.controller';

export function createCourseRouter(controller: CourseController): Router {
  const router = Router();

  router.get('/', asyncHandler(controller.listPublishedCourses));
  router.get('/categories', asyncHandler(controller.listCategories));
  router.get('/tags', asyncHandler(controller.listTags));
  router.get('/:slug', asyncHandler(controller.getPublishedCourse));

  return router;
}

export function createInstructorCourseRouter(controller: CourseController, tokenService: TokenService): Router {
  const router = Router();
  const instructorOnly = [requireAuth(tokenService), requireRole(RoleName.INSTRUCTOR)];

  router.post('/courses', ...instructorOnly, asyncHandler(controller.createCourse));
  router.get('/courses', ...instructorOnly, asyncHandler(controller.listInstructorCourses));
  router.get('/courses/:courseId', ...instructorOnly, asyncHandler(controller.getInstructorCourse));
  router.patch('/courses/:courseId', ...instructorOnly, asyncHandler(controller.updateCourse));
  router.post('/courses/:courseId/publish', ...instructorOnly, asyncHandler(controller.publishCourse));
  router.post('/courses/:courseId/archive', ...instructorOnly, asyncHandler(controller.archiveCourse));
  router.post('/courses/:courseId/modules', ...instructorOnly, asyncHandler(controller.createModule));
  router.post('/courses/:courseId/modules/reorder', ...instructorOnly, asyncHandler(controller.reorderModules));
  router.patch('/modules/:moduleId', ...instructorOnly, asyncHandler(controller.updateModule));
  router.delete('/modules/:moduleId', ...instructorOnly, asyncHandler(controller.deleteModule));
  router.post('/modules/:moduleId/lessons', ...instructorOnly, asyncHandler(controller.createLesson));
  router.post('/modules/:moduleId/lessons/reorder', ...instructorOnly, asyncHandler(controller.reorderLessons));
  router.patch('/lessons/:lessonId', ...instructorOnly, asyncHandler(controller.updateLesson));
  router.delete('/lessons/:lessonId', ...instructorOnly, asyncHandler(controller.deleteLesson));

  return router;
}
