import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import {
  checkpointIdParamSchema,
  executionHistoryQuerySchema,
  executionIdParamSchema,
  importSnapshotSchema,
  lessonIdParamSchema,
  revisionIdParamSchema,
  saveWorkspaceFilesSchema,
  workspaceIdParamSchema,
} from './code-execution.schemas';
import type { CodeExecutionService } from './code-execution.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class CodeExecutionController {
  constructor(private readonly codeExecution: CodeExecutionService) {}

  openCheckpointWorkspace = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = checkpointIdParamSchema.parse(request.params);
    response.status(200).json({ workspace: await this.codeExecution.openCheckpointWorkspace(auth.userId, params.checkpointId) });
  };

  openLessonWorkspace = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json({ workspace: await this.codeExecution.openLessonWorkspace(auth.userId, params.lessonId) });
  };

  getCodingLessonDetails = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = lessonIdParamSchema.parse(request.params);
    response.status(200).json(await this.codeExecution.getCodingLessonDetails(auth.userId, params.lessonId));
  };

  getWorkspace = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = workspaceIdParamSchema.parse(request.params);
    response.status(200).json({ workspace: await this.codeExecution.getWorkspace(auth.userId, params.workspaceId) });
  };

  saveFiles = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = workspaceIdParamSchema.parse(request.params);
    const body = saveWorkspaceFilesSchema.parse(request.body);
    response.status(200).json({ workspace: await this.codeExecution.saveFiles(auth.userId, params.workspaceId, body.files) });
  };

  importSnapshot = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = workspaceIdParamSchema.parse(request.params);
    const body = importSnapshotSchema.parse(request.body);
    response.status(200).json({ workspace: await this.codeExecution.importSnapshot(auth.userId, params.workspaceId, body.snapshotId) });
  };

  listRevisions = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = workspaceIdParamSchema.parse(request.params);
    response.status(200).json(await this.codeExecution.listRevisions(auth.userId, params.workspaceId));
  };

  restoreRevision = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const workspaceParams = workspaceIdParamSchema.parse(request.params);
    const revisionParams = revisionIdParamSchema.parse(request.params);
    response.status(200).json({
      workspace: await this.codeExecution.restoreRevision(auth.userId, workspaceParams.workspaceId, revisionParams.revisionId),
    });
  };

  runWorkspace = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = workspaceIdParamSchema.parse(request.params);
    response.status(202).json(await this.codeExecution.runWorkspace(auth.userId, params.workspaceId, request.requestId));
  };

  getExecution = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = executionIdParamSchema.parse(request.params);
    response.status(200).json({ execution: await this.codeExecution.getExecution(auth.userId, params.executionId) });
  };

  listExecutions = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = workspaceIdParamSchema.parse(request.params);
    const query = executionHistoryQuerySchema.parse(request.query);
    response.status(200).json(await this.codeExecution.listExecutions(auth.userId, params.workspaceId, query));
  };
}
