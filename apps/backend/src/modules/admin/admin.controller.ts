import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import {
  adminArchiveCourseSchema,
  adminAuditLogListQuerySchema,
  adminCourseListQuerySchema,
  adminEnrollmentListQuerySchema,
  adminExecutionListQuerySchema,
  adminInstructorListQuerySchema,
  adminJudgeSubmissionListQuerySchema,
  adminPeriodQuerySchema,
  adminProjectSubmissionListQuerySchema,
  adminUserListQuerySchema,
  adminVideoListQuerySchema,
  courseIdParamSchema,
  executionIdParamSchema,
  submissionIdParamSchema,
  updateUserRolesSchema,
  updateUserStatusSchema,
  userIdParamSchema,
  videoAssetIdParamSchema,
} from './admin.schemas';
import type { AdminService } from './admin.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class AdminController {
  constructor(private readonly admin: AdminService) {}

  dashboard = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.getDashboard(adminPeriodQuerySchema.parse(request.query)));
  };

  listUsers = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listUsers(adminUserListQuerySchema.parse(request.query)));
  };

  getUser = async (request: Request, response: Response) => {
    const params = userIdParamSchema.parse(request.params);
    response.status(200).json({ user: await this.admin.getUser(params.userId) });
  };

  updateUserStatus = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = userIdParamSchema.parse(request.params);
    const body = updateUserStatusSchema.parse(request.body);
    response.status(200).json({ user: await this.admin.updateUserStatus(auth.userId, params.userId, body) });
  };

  updateUserRoles = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = userIdParamSchema.parse(request.params);
    const body = updateUserRolesSchema.parse(request.body);
    response.status(200).json({ user: await this.admin.updateUserRoles(auth.userId, params.userId, body) });
  };

  listInstructors = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listInstructors(adminInstructorListQuerySchema.parse(request.query)));
  };

  getInstructor = async (request: Request, response: Response) => {
    const params = userIdParamSchema.parse(request.params);
    response.status(200).json(await this.admin.getInstructor(params.userId));
  };

  listCourses = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listCourses(adminCourseListQuerySchema.parse(request.query)));
  };

  getCourse = async (request: Request, response: Response) => {
    const params = courseIdParamSchema.parse(request.params);
    response.status(200).json(await this.admin.getCourse(params.courseId));
  };

  archiveCourse = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = courseIdParamSchema.parse(request.params);
    const body = adminArchiveCourseSchema.parse(request.body);
    response.status(200).json({ course: await this.admin.archiveCourse(auth.userId, params.courseId, body.reason) });
  };

  listEnrollments = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listEnrollments(adminEnrollmentListQuerySchema.parse(request.query)));
  };

  listVideos = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listVideos(adminVideoListQuerySchema.parse(request.query)));
  };

  getVideo = async (request: Request, response: Response) => {
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(200).json(await this.admin.getVideo(params.videoAssetId));
  };

  retryVideo = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = videoAssetIdParamSchema.parse(request.params);
    response.status(202).json({ video: await this.admin.retryVideo(auth.userId, params.videoAssetId, request.requestId) });
  };

  listExecutions = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listExecutions(adminExecutionListQuerySchema.parse(request.query)));
  };

  getExecution = async (request: Request, response: Response) => {
    const params = executionIdParamSchema.parse(request.params);
    response.status(200).json(await this.admin.getExecution(params.executionId));
  };

  listJudgeSubmissions = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listJudgeSubmissions(adminJudgeSubmissionListQuerySchema.parse(request.query)));
  };

  getJudgeSubmission = async (request: Request, response: Response) => {
    const params = submissionIdParamSchema.parse(request.params);
    response.status(200).json(await this.admin.getJudgeSubmission(params.submissionId));
  };

  listProjectSubmissions = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listProjectSubmissions(adminProjectSubmissionListQuerySchema.parse(request.query)));
  };

  getProjectSubmission = async (request: Request, response: Response) => {
    const params = submissionIdParamSchema.parse(request.params);
    response.status(200).json(await this.admin.getProjectSubmission(params.submissionId));
  };

  listAuditLogs = async (request: Request, response: Response) => {
    response.status(200).json(await this.admin.listAuditLogs(adminAuditLogListQuerySchema.parse(request.query)));
  };
}
