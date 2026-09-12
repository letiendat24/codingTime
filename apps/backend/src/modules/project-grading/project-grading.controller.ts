import type { Request, Response } from 'express';
import {
  checkpointParamsSchema,
  criterionParamsSchema,
  manualGradeSchema,
  reorderRubricSchema,
  rubricCriterionInputSchema,
  rubricCriterionUpdateSchema,
  submissionHistoryQuerySchema,
  submissionParamsSchema,
  submitProjectSchema,
  upsertProjectConfigSchema,
} from './project-grading.schemas';
import type { ProjectGradingService } from './project-grading.service';

export class ProjectGradingController {
  constructor(private readonly service: ProjectGradingService) {}

  getConfig = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    response.json(await this.service.getConfig(request.auth!.userId, checkpointId));
  };

  upsertConfig = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const body = upsertProjectConfigSchema.parse(request.body);
    response.json(await this.service.upsertConfig(request.auth!.userId, checkpointId, body));
  };

  createCriterion = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const body = rubricCriterionInputSchema.parse(request.body);
    response.status(201).json(await this.service.createCriterion(request.auth!.userId, checkpointId, body));
  };

  updateCriterion = async (request: Request, response: Response) => {
    const { criterionId } = criterionParamsSchema.parse(request.params);
    const body = rubricCriterionUpdateSchema.parse(request.body);
    response.json(await this.service.updateCriterion(request.auth!.userId, criterionId, body));
  };

  deleteCriterion = async (request: Request, response: Response) => {
    const { criterionId } = criterionParamsSchema.parse(request.params);
    await this.service.deleteCriterion(request.auth!.userId, criterionId);
    response.status(204).send();
  };

  reorderCriteria = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const { orderedIds } = reorderRubricSchema.parse(request.body);
    response.json(await this.service.reorderCriteria(request.auth!.userId, checkpointId, orderedIds));
  };

  submitProject = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const body = submitProjectSchema.parse(request.body);
    response.status(202).json(await this.service.submitProject(request.auth!.userId, checkpointId, body, request.requestId));
  };

  getSubmission = async (request: Request, response: Response) => {
    const { submissionId } = submissionParamsSchema.parse(request.params);
    response.json(await this.service.getSubmission(request.auth!.userId, submissionId));
  };

  listSubmissions = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const query = submissionHistoryQuerySchema.parse(request.query);
    response.json(await this.service.listSubmissions(request.auth!.userId, checkpointId, query));
  };

  listInstructorSubmissions = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const query = submissionHistoryQuerySchema.parse(request.query);
    response.json(await this.service.listInstructorSubmissions(request.auth!.userId, checkpointId, query));
  };

  applyManualGrade = async (request: Request, response: Response) => {
    const { submissionId } = submissionParamsSchema.parse(request.params);
    const body = manualGradeSchema.parse(request.body);
    response.json(await this.service.applyManualGrade(request.auth!.userId, submissionId, body));
  };
}
