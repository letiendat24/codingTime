import type {
  CodeJudgeCompletedPayload,
  CodeJudgeRequestedPayload,
  CodeJudgeTestCaseResultPayload,
  CodeJudgeTimedOutPayload,
} from '@codesync/shared';
import { outputsMatch } from './comparator';
import type { CodeJudgeWorkerEnv } from './config';
import { getRuntime } from './runtimes';
import { runInDockerSandbox } from './sandbox';
import { calculateScore } from './scoring';

export type JudgeOutcome =
  | { readonly kind: 'completed'; readonly payload: CodeJudgeCompletedPayload }
  | { readonly kind: 'timed_out'; readonly payload: CodeJudgeTimedOutPayload };

export async function judgeSubmission(input: {
  readonly payload: CodeJudgeRequestedPayload;
  readonly env: CodeJudgeWorkerEnv;
}): Promise<JudgeOutcome> {
  const runtime = getRuntime(input.payload.language);
  const testResults: CodeJudgeTestCaseResultPayload[] = [];
  const startedAt = Date.now();

  for (const testCase of input.payload.testCases) {
    const sandbox = await runInDockerSandbox({
      submissionId: input.payload.submissionId,
      testCaseId: testCase.id,
      runtime,
      entryFile: input.payload.entryFile,
      files: input.payload.files,
      stdin: testCase.input,
      timeLimitMs: input.payload.timeLimitMs,
      memoryLimitMb: input.payload.memoryLimitMb,
      env: input.env,
    });
    let status: CodeJudgeTestCaseResultPayload['status'];

    if (sandbox.status === 'timed_out') {
      status = 'TIME_LIMIT_EXCEEDED';
    } else if (sandbox.outputTruncated) {
      status = 'RUNTIME_ERROR';
    } else if (sandbox.exitCode !== 0) {
      status = 'RUNTIME_ERROR';
    } else if (outputsMatch(sandbox.stdout, testCase.expectedOutput)) {
      status = 'PASSED';
    } else {
      status = 'WRONG_ANSWER';
    }

    testResults.push({
      testCaseId: testCase.id,
      name: testCase.name,
      visibility: testCase.visibility,
      status,
      scoreEarned: status === 'PASSED' ? testCase.weight : 0,
      actualOutput: sandbox.stdout,
      stderr: sandbox.stderr,
      durationMs: sandbox.durationMs,
      memoryBytes: null,
    });

    if (status === 'TIME_LIMIT_EXCEEDED') {
      return {
        kind: 'timed_out',
        payload: {
          submissionId: input.payload.submissionId,
          durationMs: Date.now() - startedAt,
          errorCode: 'TIME_LIMIT_EXCEEDED',
          testResults,
        },
      };
    }
  }

  const score = calculateScore({
    scoringMode: input.payload.scoringMode,
    passScore: input.payload.passScore,
    testWeights: input.payload.testCases.map((testCase) => testCase.weight),
    passedWeights: testResults.filter((result) => result.status === 'PASSED').map((result) => result.scoreEarned),
  });

  return {
    kind: 'completed',
    payload: {
      submissionId: input.payload.submissionId,
      totalScore: score.score,
      maxScore: 100,
      passed: score.passed,
      totalTests: input.payload.testCases.length,
      passedTests: testResults.filter((result) => result.status === 'PASSED').length,
      durationMs: Date.now() - startedAt,
      peakMemoryBytes: null,
      testResults,
    },
  };
}
