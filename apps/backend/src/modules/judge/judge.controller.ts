import type { Request, Response } from 'express';
import {
  checkpointParamsSchema,
  reorderTestCasesSchema,
  submissionHistoryQuerySchema,
  submissionParamsSchema,
  testCaseInputSchema,
  testCaseParamsSchema,
  testCaseUpdateSchema,
  upsertCodingConfigSchema,
  workspaceParamsSchema,
} from './judge.schemas';
import type { JudgeService } from './judge.service';

export class JudgeController {
  constructor(private readonly service: JudgeService) {}

  getCodingConfig = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const result = await this.service.getCodingConfig(request.auth!.userId, checkpointId);
    response.json(result);
  };

  upsertCodingConfig = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const body = upsertCodingConfigSchema.parse(request.body);
    const result = await this.service.upsertCodingConfig(request.auth!.userId, checkpointId, body);
    response.json(result);
  };

  createTestCase = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const body = testCaseInputSchema.parse(request.body);
    const result = await this.service.createTestCase(request.auth!.userId, checkpointId, body);
    response.status(201).json(result);
  };

  updateTestCase = async (request: Request, response: Response) => {
    const { testCaseId } = testCaseParamsSchema.parse(request.params);
    const body = testCaseUpdateSchema.parse(request.body);
    const result = await this.service.updateTestCase(request.auth!.userId, testCaseId, body);
    response.json(result);
  };

  deleteTestCase = async (request: Request, response: Response) => {
    const { testCaseId } = testCaseParamsSchema.parse(request.params);
    await this.service.deleteTestCase(request.auth!.userId, testCaseId);
    response.status(204).send();
  };

  reorderTestCases = async (request: Request, response: Response) => {
    const { checkpointId } = checkpointParamsSchema.parse(request.params);
    const { orderedIds } = reorderTestCasesSchema.parse(request.body);
    const result = await this.service.reorderTestCases(request.auth!.userId, checkpointId, orderedIds);
    response.json(result);
  };

  submitWorkspace = async (request: Request, response: Response) => {
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const result = await this.service.submitWorkspace(request.auth!.userId, workspaceId, request.requestId);
    response.status(202).json(result);
  };

  getSubmission = async (request: Request, response: Response) => {
    const { submissionId } = submissionParamsSchema.parse(request.params);
    const result = await this.service.getSubmission(request.auth!.userId, submissionId);
    response.json(result);
  };

  listSubmissions = async (request: Request, response: Response) => {
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const query = submissionHistoryQuerySchema.parse(request.query);
    const result = await this.service.listSubmissions(request.auth!.userId, workspaceId, query);
    response.json(result);
  };
}
