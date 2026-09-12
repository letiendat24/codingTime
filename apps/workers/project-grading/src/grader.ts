import { readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type {
  ProjectGradingCompletedPayload,
  ProjectGradingFailedPayload,
  ProjectGradingRequestedPayload,
  ProjectGradingTimedOutPayload,
  ProjectRubricCriterionPayload,
  ProjectRubricResultPayload,
} from '@codesync/shared';
import type { ProjectGradingWorkerEnv } from './config';
import { cloneRepository } from './git';
import { calculateScore } from './rubric';
import { runInSandbox } from './sandbox';

type ProjectGradingOutcome =
  | { readonly kind: 'completed'; readonly payload: ProjectGradingCompletedPayload }
  | { readonly kind: 'timed_out'; readonly payload: ProjectGradingTimedOutPayload }
  | { readonly kind: 'failed'; readonly payload: ProjectGradingFailedPayload };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configString(criterion: ProjectRubricCriterionPayload, key: string) {
  const value = criterion.config?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function configStringArray(criterion: ProjectRubricCriterionPayload, key: string) {
  const value = criterion.config?.[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

async function safeRepositoryPath(repositoryDirectory: string, requestedPath: string) {
  const repositoryRoot = await realpath(repositoryDirectory);
  const targetPath = await realpath(join(repositoryRoot, requestedPath));
  const relativePath = relative(repositoryRoot, targetPath);

  if (relativePath.startsWith('..') || relativePath === '') {
    throw new Error('Path escapes repository root');
  }

  return targetPath;
}

function baseResult(criterion: ProjectRubricCriterionPayload): Pick<ProjectRubricResultPayload, 'criterionId' | 'title' | 'maxScore'> {
  return {
    criterionId: criterion.id,
    title: criterion.title,
    maxScore: criterion.weight,
  };
}

async function evaluateFileExists(repositoryDirectory: string, criterion: ProjectRubricCriterionPayload): Promise<ProjectRubricResultPayload> {
  const path = configString(criterion, 'path');

  if (!path) {
    return { ...baseResult(criterion), status: 'ERROR', scoreEarned: 0, feedback: 'Missing file path configuration', details: null };
  }

  try {
    await safeRepositoryPath(repositoryDirectory, path);
    return { ...baseResult(criterion), status: 'PASSED', scoreEarned: criterion.weight, feedback: null, details: { path } };
  } catch {
    return { ...baseResult(criterion), status: 'FAILED', scoreEarned: 0, feedback: `Required file was not found: ${path}`, details: { path } };
  }
}

async function evaluateJsonField(repositoryDirectory: string, criterion: ProjectRubricCriterionPayload): Promise<ProjectRubricResultPayload> {
  const path = configString(criterion, 'path');
  const jsonPath = configStringArray(criterion, 'jsonPath');

  if (!path || !jsonPath?.length) {
    return { ...baseResult(criterion), status: 'ERROR', scoreEarned: 0, feedback: 'Missing JSON_FIELD configuration', details: null };
  }

  try {
    const targetPath = await safeRepositoryPath(repositoryDirectory, path);
    const parsed = JSON.parse(await readFile(targetPath, 'utf8')) as unknown;
    let current: unknown = parsed;

    for (const segment of jsonPath) {
      if (!isPlainRecord(current) || !(segment in current)) {
        return {
          ...baseResult(criterion),
          status: 'FAILED',
          scoreEarned: 0,
          feedback: `JSON field is missing: ${jsonPath.join('.')}`,
          details: { path, jsonPath },
        };
      }

      current = current[segment];
    }

    return { ...baseResult(criterion), status: 'PASSED', scoreEarned: criterion.weight, feedback: null, details: { path, jsonPath } };
  } catch (error) {
    return {
      ...baseResult(criterion),
      status: 'FAILED',
      scoreEarned: 0,
      feedback: error instanceof SyntaxError ? 'JSON file could not be parsed' : `JSON field check failed for ${path}`,
      details: { path, jsonPath },
    };
  }
}

async function evaluateCommand(input: {
  readonly submissionId: string;
  readonly repositoryDirectory: string;
  readonly criterion: ProjectRubricCriterionPayload;
  readonly env: ProjectGradingWorkerEnv;
  readonly timeoutMs: number;
  readonly stage: 'build' | 'test';
  readonly command: readonly string[];
}): Promise<ProjectRubricResultPayload> {
  const result = await runInSandbox({
    submissionId: input.submissionId,
    stage: input.stage,
    repositoryDirectory: input.repositoryDirectory,
    command: input.command,
    timeoutMs: input.timeoutMs,
    memoryMb: input.env.PROJECT_GRADING_MEMORY_MB,
    env: input.env,
  });

  if (result.status === 'timed_out') {
    return {
      ...baseResult(input.criterion),
      status: 'FAILED',
      scoreEarned: 0,
      feedback: `${input.stage} command timed out`,
      details: { durationMs: result.durationMs, outputTruncated: result.outputTruncated },
    };
  }

  return {
    ...baseResult(input.criterion),
    status: result.exitCode === 0 ? 'PASSED' : 'FAILED',
    scoreEarned: result.exitCode === 0 ? input.criterion.weight : 0,
    feedback: result.exitCode === 0 ? null : `${input.stage} command failed`,
    details: {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      outputTruncated: result.outputTruncated,
    },
  };
}

async function evaluateCriterion(input: {
  readonly submissionId: string;
  readonly repositoryDirectory: string;
  readonly criterion: ProjectRubricCriterionPayload;
  readonly payload: ProjectGradingRequestedPayload;
  readonly env: ProjectGradingWorkerEnv;
}): Promise<ProjectRubricResultPayload> {
  if (input.criterion.type === 'MANUAL') {
    return { ...baseResult(input.criterion), status: 'PENDING_MANUAL', scoreEarned: 0, feedback: 'Pending instructor review', details: null };
  }

  if (input.criterion.autoCheckType === 'FILE_EXISTS') {
    return evaluateFileExists(input.repositoryDirectory, input.criterion);
  }

  if (input.criterion.autoCheckType === 'JSON_FIELD') {
    return evaluateJsonField(input.repositoryDirectory, input.criterion);
  }

  if (input.criterion.autoCheckType === 'BUILD_SUCCESS') {
    return evaluateCommand({
      submissionId: input.submissionId,
      repositoryDirectory: input.repositoryDirectory,
      criterion: input.criterion,
      env: input.env,
      timeoutMs: input.payload.limits.buildTimeoutMs,
      stage: 'build',
      command: ['npm', 'run', 'build', '--if-present'],
    });
  }

  if (input.criterion.autoCheckType === 'TEST_SUCCESS') {
    return evaluateCommand({
      submissionId: input.submissionId,
      repositoryDirectory: input.repositoryDirectory,
      criterion: input.criterion,
      env: input.env,
      timeoutMs: input.payload.limits.testTimeoutMs,
      stage: 'test',
      command: ['npm', 'test'],
    });
  }

  return {
    ...baseResult(input.criterion),
    status: 'ERROR',
    scoreEarned: 0,
    feedback: 'Unsupported project rubric check',
    details: { autoCheckType: input.criterion.autoCheckType },
  };
}

function autoScore(results: readonly ProjectRubricResultPayload[], criteria: readonly ProjectRubricCriterionPayload[]) {
  const autoCriteria = criteria.filter((criterion) => criterion.type === 'AUTO');
  const totalWeight = autoCriteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const earnedWeight = results
    .filter((result) => autoCriteria.some((criterion) => criterion.id === result.criterionId))
    .reduce((sum, result) => sum + result.scoreEarned, 0);

  return totalWeight <= 0 ? 0 : Math.round((earnedWeight / totalWeight) * 10_000) / 100;
}

export async function gradeProject(input: {
  readonly payload: ProjectGradingRequestedPayload;
  readonly repositoryDirectory: string;
  readonly env: ProjectGradingWorkerEnv;
}): Promise<ProjectGradingOutcome> {
  const startedAt = Date.now();

  try {
    await cloneRepository({
      cloneUrl: input.payload.repository.cloneUrl,
      commitSha: input.payload.repository.commitSha,
      targetDirectory: input.repositoryDirectory,
      timeoutMs: input.payload.limits.cloneTimeoutMs,
      maxRepositoryBytes: input.payload.limits.maxRepositoryBytes,
    });

    const results: ProjectRubricResultPayload[] = [];

    for (const criterion of input.payload.criteria) {
      if (Date.now() - startedAt > input.payload.limits.gradingTimeoutMs) {
        return {
          kind: 'timed_out',
          payload: {
            submissionId: input.payload.submissionId,
            durationMs: Date.now() - startedAt,
            errorCode: 'PROJECT_GRADING_TIMED_OUT',
            results,
          },
        };
      }

      results.push(await evaluateCriterion({
        submissionId: input.payload.submissionId,
        repositoryDirectory: input.repositoryDirectory,
        criterion,
        payload: input.payload,
        env: input.env,
      }));
    }

    const score = calculateScore({
      passScore: input.payload.passScore,
      criteria: input.payload.criteria,
      results,
    });
    const manualReviewPending = results.some((result) => result.status === 'PENDING_MANUAL');

    return {
      kind: 'completed',
      payload: {
        submissionId: input.payload.submissionId,
        autoScore: autoScore(results, input.payload.criteria),
        score: score.score,
        passed: score.passed,
        manualReviewPending,
        summary: manualReviewPending ? 'Automatic checks completed; manual review is required.' : 'Project grading completed.',
        results,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Project grading failed';
    const timedOut = /timed out|ETIMEDOUT|SIGTERM|timeout/i.test(message);

    return timedOut
      ? {
          kind: 'timed_out',
          payload: {
            submissionId: input.payload.submissionId,
            durationMs: Date.now() - startedAt,
            errorCode: 'PROJECT_GRADING_TIMED_OUT',
            results: [],
          },
        }
      : {
          kind: 'failed',
          payload: {
            submissionId: input.payload.submissionId,
            errorCode: 'PROJECT_GRADING_FAILED',
            errorMessage: message,
            retryable: false,
          },
        };
  }
}
