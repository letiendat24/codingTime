import type { Request, Response } from 'express';
import {
  createPracticeProblemSchema,
  commitPracticeGeneratedTestsSchema,
  instructorPracticeListQuerySchema,
  importPracticeTestCasesSchema,
  practiceProblemIdParamsSchema,
  practiceProblemSlugParamsSchema,
  practiceExecutionParamsSchema,
  previewPracticeGeneratorSchema,
  previewPracticeInputImportSchema,
  practiceHiddenTestCaseSourceParamsSchema,
  practiceSubmissionListQuerySchema,
  practiceTestCaseInputSchema,
  practiceTestCaseParamsSchema,
  practiceTestCaseUpdateSchema,
  reorderPracticeTestCasesSchema,
  studentPracticeListQuerySchema,
  updatePracticeProblemSchema,
} from './practice.schemas';
import type { PracticeService } from './practice.service';

export class PracticeController {
  constructor(private readonly service: PracticeService) {}

  createProblem = async (request: Request, response: Response) => {
    response.status(201).json(await this.service.createProblem(request.auth!.userId, createPracticeProblemSchema.parse(request.body)));
  };

  listInstructorProblems = async (request: Request, response: Response) => {
    response.status(200).json(await this.service.listInstructorProblems(request.auth!.userId, instructorPracticeListQuerySchema.parse(request.query)));
  };

  getInstructorProblem = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.getInstructorProblem(request.auth!.userId, params.problemId));
  };

  updateProblem = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.updateProblem(request.auth!.userId, params.problemId, updatePracticeProblemSchema.parse(request.body)));
  };

  publishProblem = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.publishProblem(request.auth!.userId, params.problemId));
  };

  validateProblem = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.validateProblem(request.auth!.userId, params.problemId));
  };

  archiveProblem = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.archiveProblem(request.auth!.userId, params.problemId));
  };

  createTestCase = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(201).json(await this.service.createTestCase(request.auth!.userId, params.problemId, practiceTestCaseInputSchema.parse(request.body)));
  };

  updateTestCase = async (request: Request, response: Response) => {
    const params = practiceTestCaseParamsSchema.parse(request.params);
    response.status(200).json(await this.service.updateTestCase(request.auth!.userId, params.testCaseId, practiceTestCaseUpdateSchema.parse(request.body)));
  };

  deleteTestCase = async (request: Request, response: Response) => {
    const params = practiceTestCaseParamsSchema.parse(request.params);
    await this.service.deleteTestCase(request.auth!.userId, params.testCaseId, request.auth!.roles);
    response.status(204).send();
  };

  deleteHiddenTestCases = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.deleteHiddenTestCases(request.auth!.userId, params.problemId, request.auth!.roles));
  };

  deleteHiddenTestCasesBySource = async (request: Request, response: Response) => {
    const params = practiceHiddenTestCaseSourceParamsSchema.parse(request.params);
    response.status(200).json(await this.service.deleteHiddenTestCasesBySource(
      request.auth!.userId,
      params.problemId,
      params.source,
      request.auth!.roles,
    ));
  };

  deleteProblem = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    await this.service.deleteProblem(request.auth!.userId, params.problemId);
    response.status(204).send();
  };

  importTestCases = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(201).json(await this.service.importTestCases(
      request.auth!.userId,
      params.problemId,
      importPracticeTestCasesSchema.parse(request.body),
    ));
  };

  previewInputImport = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(202).json(await this.service.previewInputImport(
      request.auth!.userId,
      params.problemId,
      previewPracticeInputImportSchema.parse(request.body),
      request.requestId,
    ));
  };

  previewGenerator = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(202).json(await this.service.previewGenerator(
      request.auth!.userId,
      params.problemId,
      previewPracticeGeneratorSchema.parse(request.body),
      request.requestId,
    ));
  };

  commitGeneratedTests = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(201).json(await this.service.commitGeneratedTests(
      request.auth!.userId,
      params.problemId,
      commitPracticeGeneratedTestsSchema.parse(request.body),
    ));
  };

  getAuthoringExecution = async (request: Request, response: Response) => {
    const params = practiceExecutionParamsSchema.parse(request.params);
    response.status(200).json(await this.service.getAuthoringExecution(request.auth!.userId, params.executionId));
  };

  reorderTestCases = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    const body = reorderPracticeTestCasesSchema.parse(request.body);
    response.status(200).json(await this.service.reorderTestCases(request.auth!.userId, params.problemId, body.orderedIds));
  };

  listProblems = async (request: Request, response: Response) => {
    response.status(200).json(await this.service.listStudentProblems(request.auth!.userId, studentPracticeListQuerySchema.parse(request.query)));
  };

  listTags = async (_request: Request, response: Response) => {
    response.status(200).json(await this.service.listTags());
  };

  getProblem = async (request: Request, response: Response) => {
    const params = practiceProblemSlugParamsSchema.parse(request.params);
    response.status(200).json(await this.service.getStudentProblem(request.auth!.userId, params.slug));
  };

  openWorkspace = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.openWorkspace(request.auth!.userId, params.problemId));
  };

  resetWorkspace = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.resetWorkspace(request.auth!.userId, params.problemId));
  };

  submit = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(202).json(await this.service.submit(request.auth!.userId, params.problemId, request.requestId));
  };

  listSubmissions = async (request: Request, response: Response) => {
    const params = practiceProblemIdParamsSchema.parse(request.params);
    response.status(200).json(await this.service.listSubmissions(request.auth!.userId, params.problemId, practiceSubmissionListQuerySchema.parse(request.query)));
  };

  stats = async (request: Request, response: Response) => {
    response.status(200).json(await this.service.stats(request.auth!.userId));
  };
}
